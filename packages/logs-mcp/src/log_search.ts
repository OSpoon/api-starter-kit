import { createReadStream } from 'node:fs'
import { lstat, readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { createInterface } from 'node:readline'

export type LogSearchInput = {
  service?: string
  query?: string
  requestId?: string
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
  sinceMinutes?: number
  offset?: number
  limit?: number
}

const serviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

export function formatTimestampLocal(timestamp: number, timeZone = serviceTimeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hourCycle: 'h23',
  }).formatToParts(timestamp)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}.${values.fractionalSecond} (${timeZone})`
}

const levelNames: Record<number, LogSearchInput['level']> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
}
function boundText(value: unknown) {
  if (typeof value !== 'string') return undefined
  return value.slice(0, 1000)
}

function boundValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[OMITTED]'
  if (typeof value === 'string') return boundText(value)
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => boundValue(item, depth + 1))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, boundValue(item, depth + 1)])
  )
}

function projectRecord(record: Record<string, unknown>, service: string) {
  const error =
    record.err && typeof record.err === 'object' ? (record.err as Record<string, unknown>) : null
  const rawLevel = record.level
  const level = typeof rawLevel === 'number' ? levelNames[rawLevel] : rawLevel
  const date = typeof record.time === 'number' ? new Date(record.time) : null
  const timestamp = date && Number.isFinite(date.getTime()) ? date.toISOString() : null
  const timestampLocal =
    date && Number.isFinite(date.getTime()) ? formatTimestampLocal(date.getTime()) : null
  const requestId = record.request_id ?? record.requestId
  const projected: Record<string, unknown> = {
    service,
    timestamp,
    timestampLocal,
    level: typeof level === 'string' ? level : 'unknown',
    message: boundText(record.msg) ?? '',
  }

  for (const key of ['traceId', 'method', 'url', 'route', 'status', 'durationMs']) {
    if (record[key] !== undefined && record[key] !== null) {
      projected[key] = typeof record[key] === 'string' ? boundText(record[key]) : record[key]
    }
  }
  if (requestId !== undefined && requestId !== null) {
    projected.requestId = typeof requestId === 'string' ? boundText(requestId) : requestId
  }
  if (record.requestBody !== undefined) projected.requestBody = boundValue(record.requestBody)
  if (record.responseBody !== undefined) projected.responseBody = boundValue(record.responseBody)
  if (error) {
    projected.error = {
      type: boundText(error.type),
      code: boundText(error.code),
      message: boundText(error.message),
    }
  }

  for (const key of ['requestBody', 'responseBody']) {
    const value = projected[key]
    if (value !== undefined && Buffer.byteLength(JSON.stringify(value) ?? '') > 4096) {
      projected[key] = '[OMITTED: payload exceeds 4 KB]'
    }
  }
  return projected
}

async function* matchingRecords(
  files: string[],
  input: LogSearchInput,
  cutoff: number | undefined
) {
  const query = input.query?.trim().toLowerCase()

  for (const file of files) {
    try {
      const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity })
      for await (const line of lines) {
        let record: Record<string, unknown>
        try {
          const parsed: unknown = JSON.parse(line)
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
          record = parsed as Record<string, unknown>
        } catch {
          continue
        }

        if (cutoff !== undefined && typeof record.time === 'number' && record.time < cutoff)
          continue
        const level = typeof record.level === 'number' ? levelNames[record.level] : record.level
        if (input.level && level !== input.level) continue
        if (input.requestId) {
          const ids = [record.request_id, record.requestId, record.traceId, record.trace_id]
          if (!ids.some((id) => id === input.requestId)) continue
        }
        if (query && !line.toLowerCase().includes(query)) continue
        yield record
      }
    } catch {
      // A rotated log can disappear while it is being read.
    }
  }
}

async function listLogFiles(logDirectory: string) {
  const pending = [logDirectory]
  const files: { name: string; service: string; index: number; modifiedAt: number }[] = []

  while (pending.length) {
    const directory = pending.pop()!
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      if (directory === logDirectory && (error as NodeJS.ErrnoException).code === 'ENOENT')
        return []
      if (directory === logDirectory) throw error
      continue
    }

    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        pending.push(path)
        continue
      }
      const rotatedMatch = entry.isFile() ? /^(.+)\.(\d+)\.log$/.exec(entry.name) : null
      const activeMatch = entry.isFile() && !rotatedMatch ? /^(.+)\.log$/.exec(entry.name) : null
      const match = rotatedMatch ?? activeMatch
      if (!match) continue
      const relativeDirectory = relative(logDirectory, directory)
      const topDirectory = relativeDirectory.split(sep)[0]
      const prefix = match[1]!

      try {
        const fileStats = await lstat(path)
        if (!fileStats.isFile()) continue
        files.push({
          name: path,
          service: topDirectory
            ? prefix === topDirectory
              ? topDirectory
              : `${topDirectory}/${prefix}`
            : prefix,
          index: rotatedMatch ? Number(rotatedMatch[2]) : 0,
          modifiedAt: fileStats.mtimeMs,
        })
      } catch {
        continue
      }
    }
  }

  return files
}

export async function listLogServices(logDirectory: string) {
  const files = await listLogFiles(logDirectory)
  return [...new Set(files.map(({ service }) => service))].sort()
}

export async function searchLogs(logDirectory: string, input: LogSearchInput) {
  const limit = input.limit ?? 20
  const offset = input.offset ?? 0
  const fileEntries = await listLogFiles(logDirectory)
  const groupedFiles = new Map<string, { name: string; index: number; modifiedAt: number }[]>()
  for (const file of fileEntries) {
    const group = groupedFiles.get(file.service) ?? []
    group.push({ name: file.name, index: file.index, modifiedAt: file.modifiedAt })
    groupedFiles.set(file.service, group)
  }
  const servicesAvailable = [...groupedFiles.keys()].sort()
  const requestedService = input.service?.trim()
  if (servicesAvailable.length === 0) {
    return {
      error: 'No supported log files found. Expected service.log or service.<rotation>.log files.',
      filesScanned: 0,
      totalMatches: 0,
      offset,
      limit,
      hasMore: false,
      nextOffset: null,
      servicesAvailable,
      items: [],
    }
  }
  if (requestedService && !groupedFiles.has(requestedService)) {
    return {
      error: `Unknown log service: ${requestedService}`,
      requestedService,
      filesScanned: 0,
      totalMatches: 0,
      offset,
      limit,
      hasMore: false,
      nextOffset: null,
      servicesAvailable,
      items: [],
    }
  }
  const service =
    requestedService || (servicesAvailable.length === 1 ? servicesAvailable[0] : undefined)
  if (!service && servicesAvailable.length > 1) {
    return {
      filesScanned: 0,
      totalMatches: 0,
      offset,
      limit,
      hasMore: false,
      nextOffset: null,
      serviceRequired: true,
      servicesAvailable,
      items: [],
    }
  }
  const files = (service ? (groupedFiles.get(service) ?? []) : [])
    .sort(
      (left, right) =>
        left.modifiedAt - right.modifiedAt ||
        right.index - left.index ||
        left.name.localeCompare(right.name)
    )
    .slice(0, 6)
    .map(({ name }) => name)
  const cutoff = input.sinceMinutes ? Date.now() - input.sinceMinutes * 60_000 : undefined

  let totalMatches = 0
  for await (const _record of matchingRecords(files, input, cutoff)) totalMatches++

  const start = Math.max(0, totalMatches - offset - limit)
  const end = Math.max(0, totalMatches - offset)
  const page: Record<string, unknown>[] = []
  let matchIndex = 0
  // Two streaming passes keep memory bounded for every page, including large offsets.
  // shortcut: concurrent rotation can shift pages between passes; retry if the results look inconsistent.
  for await (const record of matchingRecords(files, input, cutoff)) {
    if (matchIndex >= start && matchIndex < end) page.push(projectRecord(record, service ?? ''))
    matchIndex++
  }

  const items = page.reverse()
  const hasMore = offset + items.length < totalMatches
  return {
    filesScanned: files.length,
    service: service ?? input.service?.trim() ?? null,
    servicesAvailable,
    totalMatches,
    offset,
    limit,
    hasMore,
    nextOffset: hasMore ? offset + items.length : null,
    items,
  }
}
