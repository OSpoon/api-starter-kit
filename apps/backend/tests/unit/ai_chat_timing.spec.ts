import { test } from '@japa/runner'

import { AiChatTiming } from '#services/ai_chat_timing'

test.group('AI chat timing', () => {
  test('captures user-visible response stages without request content', ({ assert }) => {
    let now = 100
    const timing = new AiChatTiming(() => now)

    now = 125
    timing.markFirstAgentEvent()
    now = 140
    timing.markFirstToolStarted()
    now = 215
    timing.markFirstToolCompleted()
    now = 260
    timing.markFirstResponseToken()

    assert.deepEqual(timing.summary('completed'), {
      outcome: 'completed',
      totalMs: 160,
      firstAgentEventMs: 25,
      firstToolStartedMs: 40,
      firstToolCompletedMs: 115,
      firstResponseTokenMs: 160,
    })
  })

  test('reports unavailable stages as null when a request fails or is aborted', ({ assert }) => {
    let now = 100
    const timing = new AiChatTiming(() => now)
    now = 150
    assert.equal(timing.summary('aborted').firstResponseTokenMs, null)
  })
})
