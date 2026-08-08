import { test } from '@japa/runner'

import { createAiAgentTools } from '#services/ai_agent_tool_registry'

test.group('AI agent tool registry', () => {
  test('keeps overall permission reviews separate from one-permission checks', ({ assert }) => {
    const diagnosticTool = createAiAgentTools({
      userId: 1,
      conversationId: 1,
      agentRunId: 'test-run',
    }).find((registeredTool) => registeredTool.name === 'diagnose_my_access')

    if (!diagnosticTool) throw new Error('Expected access diagnostic tool')

    assert.include(diagnosticTool.description, 'overall permission review')
    assert.include(diagnosticTool.description, 'omit permissionCode')
    assert.include(
      diagnosticTool.description,
      'explicitly asks whether they have one named permission'
    )
  })
})
