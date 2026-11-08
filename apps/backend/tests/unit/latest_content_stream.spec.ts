import { test } from '@japa/runner'

import { LatestContentStream } from '#channels/latest_content_stream'

const tick = () => new Promise<void>((resolve) => setImmediate(resolve))

test.group('Latest content stream', () => {
  test('coalesces pending content and never overlaps updates', async ({ assert }) => {
    const updates: string[] = []
    let releaseFirstUpdate!: () => void
    const firstUpdateFinished = new Promise<void>((resolve) => {
      releaseFirstUpdate = resolve
    })
    let updateCount = 0
    const stream = new LatestContentStream(
      '正在输入……',
      async (content) => {
        updates.push(content)
        updateCount += 1
        if (updateCount === 1) await firstUpdateFinished
      },
      { now: () => 0, intervalMs: 250, sleep: async () => undefined }
    )

    stream.publish('第一版')
    stream.publish('最终版')
    await tick()
    assert.deepEqual(updates, ['最终版'])

    stream.publish('后续版')
    await tick()
    assert.deepEqual(updates, ['最终版'])

    releaseFirstUpdate()
    await stream.finish()
    assert.deepEqual(updates, ['最终版'])
  })

  test('stops the stream after an update failure', async ({ assert }) => {
    let updateCount = 0
    const stream = new LatestContentStream(
      '正在输入……',
      async () => {
        updateCount += 1
        throw new Error('channel unavailable')
      },
      { now: () => 0, intervalMs: 250, sleep: async () => undefined }
    )

    stream.publish('内容')
    await tick()
    const error = await stream.finish()

    assert.instanceOf(error, Error)
    assert.equal(updateCount, 1)
    stream.publish('不会再发送')
    await tick()
    assert.equal(updateCount, 1)
  })

  test('restarts updates for tool progress and the final answer', async ({ assert }) => {
    const updates: string[] = []
    const stream = new LatestContentStream(
      '正在输入……',
      async (content) => {
        updates.push(content)
      },
      {
        now: () => 0,
        intervalMs: 0,
        sleep: async () => undefined,
      }
    )

    stream.publish('候选文字')
    await tick()
    stream.publish('正在执行工具…')
    await tick()
    stream.publish('最终答复')
    await tick()
    await stream.finish()

    assert.deepEqual(updates, ['候选文字', '正在执行工具…', '最终答复'])
  })
})
