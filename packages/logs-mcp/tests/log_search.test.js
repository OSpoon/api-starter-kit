import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { formatTimestampLocal, searchLogs } from '../dist/log_search.js'

test('formats log timestamps in the selected service timezone', () => {
  assert.equal(
    formatTimestampLocal(Date.parse('2026-10-25T04:19:55.121Z'), 'Asia/Shanghai'),
    '2026-10-25 12:19:55.121 (Asia/Shanghai)'
  )
})

test('searches rotated service logs and pages complete values', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'logs-search-'))
  try {
    await mkdir(directory, { recursive: true })
    for (let id = 1; id <= 6; id++) {
      const record = {
        level: id === 6 ? 50 : 30,
        time: 1_800_000_000_000 + id,
        msg: id === 6 ? 'failed for private@example.com token=secret-value' : `event-${id}`,
        ...(id === 6
          ? {
              request_id: 'request-123',
              err: { type: 'Error', message: 'Bearer secret-value rejected', stack: 'private' },
              requestBody: { email: 'private@example.com', query: 'find this record' },
            }
          : {}),
      }
      await writeFile(join(directory, `worker.${7 - id}.log`), JSON.stringify(record))
    }
    await symlink('worker.1.log', join(directory, 'current.log'))

    const filtered = await searchLogs(directory, {
      requestId: 'request-123',
      level: 'error',
      query: 'private@example.com',
    })
    assert.equal(filtered.filesScanned, 6)
    assert.equal(filtered.service, 'worker')
    assert.deepEqual(filtered.servicesAvailable, ['worker'])
    assert.equal(filtered.totalMatches, 1)
    assert.equal(filtered.items[0].message, 'failed for private@example.com token=secret-value')
    assert.deepEqual(filtered.items[0].requestBody, {
      email: 'private@example.com',
      query: 'find this record',
    })
    assert.deepEqual(filtered.items[0].error, {
      type: 'Error',
      code: undefined,
      message: 'Bearer secret-value rejected',
    })

    const firstPage = await searchLogs(directory, { limit: 2 })
    assert.deepEqual(
      firstPage.items.map((item) => item.message),
      ['failed for private@example.com token=secret-value', 'event-5']
    )
    assert.equal(firstPage.nextOffset, 2)
    assert.equal(firstPage.items[0].timestamp, '2027-01-15T08:00:00.006Z')
    assert.match(firstPage.items[0].timestampLocal, /\(.*\)$/)

    const nextPage = await searchLogs(directory, {
      offset: firstPage.nextOffset,
      limit: 2,
    })
    assert.deepEqual(
      nextPage.items.map((item) => item.message),
      ['event-4', 'event-3']
    )
    assert.equal(nextPage.nextOffset, 4)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('requires a service when the log directory contains multiple services', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'logs-search-'))
  try {
    await writeFile(
      join(directory, 'backend.1.log'),
      JSON.stringify({ level: 30, time: 1_800_000_000_000, msg: 'backend-event' })
    )
    await writeFile(
      join(directory, 'worker.1.log'),
      JSON.stringify({ level: 30, time: 1_800_000_000_001, msg: 'worker-event' })
    )

    const ambiguous = await searchLogs(directory, {})
    assert.equal(ambiguous.serviceRequired, true)
    assert.deepEqual(ambiguous.servicesAvailable, ['backend', 'worker'])

    const selected = await searchLogs(directory, { service: 'worker' })
    assert.equal(selected.service, 'worker')
    assert.deepEqual(
      selected.items.map((item) => item.message),
      ['worker-event']
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('reports the available services when a requested service is unknown', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'logs-search-'))
  try {
    await writeFile(
      join(directory, 'backend.1.log'),
      JSON.stringify({ level: 30, time: 1_800_000_000_000, msg: 'backend-event' })
    )

    const result = await searchLogs(directory, { service: 'system' })
    assert.equal(result.error, 'Unknown log service: system')
    assert.equal(result.requestedService, 'system')
    assert.deepEqual(result.servicesAvailable, ['backend'])
    assert.equal(result.filesScanned, 0)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('finds service logs recursively under a shared log root', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'logs-search-'))
  try {
    for (const service of ['backend', 'worker']) {
      const serviceDirectory = join(directory, service)
      await mkdir(serviceDirectory)
      await writeFile(
        join(serviceDirectory, `${service}.1.log`),
        JSON.stringify({ level: 30, time: 1_800_000_000_000, msg: `${service}-event` })
      )
      await writeFile(
        join(serviceDirectory, `${service}.log`),
        JSON.stringify({ level: 30, time: 1_800_000_000_001, msg: `${service}-active` })
      )
    }

    const result = await searchLogs(directory, { service: 'backend' })
    assert.deepEqual(result.servicesAvailable, ['backend', 'worker'])
    assert.deepEqual(
      result.items.map((item) => item.message),
      ['backend-active', 'backend-event']
    )
    assert.equal(result.filesScanned, 2)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('scans the newest modified service log last across legacy and nested paths', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'logs-search-'))
  try {
    const serviceDirectory = join(directory, 'backend')
    await mkdir(serviceDirectory)
    const olderLog = join(directory, 'backend.log')
    const newerLog = join(serviceDirectory, 'backend.1.log')
    await writeFile(
      olderLog,
      JSON.stringify({ level: 30, time: Date.parse('2026-10-24T13:37:59.079Z'), msg: 'older' })
    )
    await writeFile(
      newerLog,
      JSON.stringify({ level: 30, time: Date.parse('2026-10-25T12:08:45.226Z'), msg: 'newer' })
    )
    await utimes(
      olderLog,
      new Date('2026-10-24T13:38:00.000Z'),
      new Date('2026-10-24T13:38:00.000Z')
    )
    await utimes(
      newerLog,
      new Date('2026-10-25T12:08:46.000Z'),
      new Date('2026-10-25T12:08:46.000Z')
    )

    const result = await searchLogs(directory, { limit: 1 })
    assert.equal(result.filesScanned, 2)
    assert.deepEqual(
      result.items.map((item) => item.message),
      ['newer']
    )
    assert.equal(result.items[0].timestamp, '2026-10-25T12:08:45.226Z')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
