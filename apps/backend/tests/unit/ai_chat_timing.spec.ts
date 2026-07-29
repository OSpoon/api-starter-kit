import { test } from '@japa/runner'

import { AiChatTiming } from '#services/ai_chat_timing'

test.group('AI chat timing', () => {
  test('captures first-stage, tool, and workflow-stage durations without request content', ({
    assert,
  }) => {
    let now = 100
    const timing = new AiChatTiming(() => now)

    now = 125
    timing.markFirstAgentEvent()
    now = 140
    timing.startTool('search_knowledge')
    timing.startNode('agent_run')
    now = 215
    timing.finishTool('search_knowledge')
    now = 260
    timing.markFirstResponseToken()
    now = 300
    timing.finishNode('agent_run')

    assert.deepEqual(timing.summary('completed'), {
      outcome: 'completed',
      totalMs: 200,
      firstAgentEventMs: 25,
      firstToolStartedMs: 40,
      firstToolCompletedMs: 115,
      firstResponseTokenMs: 160,
      tools: [{ name: 'search_knowledge', durationMs: 75 }],
      nodes: [{ name: 'agent_run', durationMs: 160 }],
    })
  })

  test('closes in-progress workflow stages when a request fails or is aborted', ({ assert }) => {
    let now = 100
    const timing = new AiChatTiming(() => now)
    timing.startNode('context_preparation')
    now = 150
    timing.finishOpenNodes()

    assert.deepEqual(timing.summary('aborted').nodes, [
      { name: 'context_preparation', durationMs: 50 },
    ])
  })
})
