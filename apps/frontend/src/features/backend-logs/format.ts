export type BackendLogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'raw'

export type FormattedBackendLogLine = {
  raw: string
  timestamp: number | null
  level: BackendLogLevel
  message: string
  fields: Array<{ key: string; value: string }>
  structured: boolean
}

const standardFields = new Set(['time', 'level', 'msg', 'pid', 'hostname'])

function getLevel(level: number): BackendLogLevel {
  if (level <= 10) return 'trace'
  if (level <= 20) return 'debug'
  if (level <= 30) return 'info'
  if (level <= 40) return 'warn'
  if (level <= 50) return 'error'
  return 'fatal'
}

function formatFieldValue(value: unknown) {
  if (typeof value === 'string') return JSON.stringify(value)
  return JSON.stringify(value) ?? String(value)
}

export function formatBackendLogLine(raw: string): FormattedBackendLogLine {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return { raw, timestamp: null, level: 'raw', message: raw, fields: [], structured: false }
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { raw, timestamp: null, level: 'raw', message: raw, fields: [], structured: false }
  }

  const record = value as Record<string, unknown>
  if (typeof record.level !== 'number' || typeof record.msg !== 'string') {
    return { raw, timestamp: null, level: 'raw', message: raw, fields: [], structured: false }
  }

  const fields = Object.entries(record)
    .filter(
      ([key, fieldValue]) =>
        !standardFields.has(key) && !(key === 'request_id' && record.requestId === fieldValue)
    )
    .map(([key, fieldValue]) => ({ key, value: formatFieldValue(fieldValue) }))

  return {
    raw,
    timestamp: typeof record.time === 'number' ? record.time : null,
    level: getLevel(record.level),
    message: record.msg,
    fields,
    structured: true,
  }
}
