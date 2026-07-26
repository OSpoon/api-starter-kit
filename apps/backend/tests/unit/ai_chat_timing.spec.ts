import { test } from '@japa/runner'

import { AiChatTiming } from '#services/ai_chat_timing'

test.group('AI chat timing', () => {
  test('captures first-stage and per-tool durations without request content', ({ assert }) => {
    let now = 100
    const timing = new AiChatTiming(() => now)

    now = 125
    timing.markFirstAgentEvent()
    now = 140
    timing.startTool('search_knowledge')
    now = 215
    timing.finishTool('search_knowledge')
    now = 260
    timing.markFirstResponseToken()
    now = 300

    assert.deepEqual(timing.summary('completed'), {
      outcome: 'completed',
      totalMs: 200,
      firstAgentEventMs: 25,
      firstToolStartedMs: 40,
      firstToolCompletedMs: 115,
      firstResponseTokenMs: 160,
      tools: [{ name: 'search_knowledge', durationMs: 75 }],
    })
  })
})
