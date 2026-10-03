import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createJiti } from 'jiti'

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const jiti = createJiti(import.meta.url, { alias: { '@': `${root}/src` } })
const { reindexKnowledgeDocuments } = await jiti.import(`${root}/src/features/knowledge/api.ts`)

test('batch reindex processes unique documents sequentially through the authorized endpoint', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  const progress = []
  let active = 0
  let peak = 0
  globalThis.fetch = async (path, options) => {
    active += 1
    peak = Math.max(peak, active)
    calls.push({ path, method: options.method, token: options.headers.get('Authorization') })
    await new Promise((resolve) => setTimeout(resolve, 5))
    active -= 1
    const id = Number(path.match(/\/(\d+)\/reindex$/)[1])
    return Response.json({ data: { id, title: `Document ${id}`, chunkCount: 3 } })
  }
  try {
    const result = await reindexKnowledgeDocuments('test-token', [5, 8, 5], (done, total) =>
      progress.push([done, total])
    )
    assert.equal(peak, 1)
    assert.deepEqual(
      calls,
      [5, 8].map((id) => ({
        path: `/api/v1/system/knowledge-documents/${id}/reindex`,
        method: 'POST',
        token: 'Bearer test-token',
      }))
    )
    assert.deepEqual(
      result.items.map((document) => document.id),
      [5, 8]
    )
    assert.deepEqual(result.failed, [])
    assert.deepEqual(progress, [
      [1, 2],
      [2, 2],
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('batch reindex preserves successful results and continues after a document failure', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  const progress = []
  globalThis.fetch = async (path) => {
    const id = Number(path.match(/\/(\d+)\/reindex$/)[1])
    calls.push(id)
    return id === 2
      ? Response.json({ message: 'Embedding provider unavailable' }, { status: 503 })
      : Response.json({ data: { id } })
  }
  try {
    const result = await reindexKnowledgeDocuments(null, [1, 2, 3], (done, total) =>
      progress.push([done, total])
    )
    assert.deepEqual(calls, [1, 2, 3])
    assert.deepEqual(
      result.items.map((document) => document.id),
      [1, 3]
    )
    assert.deepEqual(result.failed, [{ id: 2, message: 'Embedding provider unavailable' }])
    assert.deepEqual(progress, [
      [1, 3],
      [2, 3],
      [3, 3],
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

for (const status of [401, 403]) {
  test(`batch reindex stops further requests after ${status} and reports unprocessed documents`, async () => {
    const originalFetch = globalThis.fetch
    const calls = []
    globalThis.fetch = async (path) => {
      const id = Number(path.match(/\/(\d+)\/reindex$/)[1])
      calls.push(id)
      return id === 1
        ? Response.json({ data: { id } })
        : Response.json({ message: 'Access denied' }, { status })
    }
    try {
      const result = await reindexKnowledgeDocuments(null, [1, 2, 3])
      assert.deepEqual(calls, [1, 2])
      assert.deepEqual(
        result.items.map((document) => document.id),
        [1]
      )
      assert.deepEqual(
        result.failed,
        [2, 3].map((id) => ({ id, message: 'Access denied' }))
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })
}

test('batch reindex with an empty selection sends no requests', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    throw new Error('No request expected')
  }
  try {
    assert.deepEqual(await reindexKnowledgeDocuments(null, []), { items: [], failed: [] })
  } finally {
    globalThis.fetch = originalFetch
  }
})
