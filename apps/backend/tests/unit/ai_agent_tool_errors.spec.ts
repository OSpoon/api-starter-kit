import { test } from '@japa/runner'

import {
  isAiAgentTerminalToolResult,
  isRecoverableAiAgentReadToolError,
} from '#ai/core/ai_agent_tool_errors'

test.group('AI agent read tool errors', () => {
  test('allows the agent to recover from a read failure', ({ assert }) => {
    const output = { kind: 'query_error', code: 'failed', message: 'temporary failure' }

    assert.isTrue(isRecoverableAiAgentReadToolError('run_registered_query', output))
    assert.isFalse(isAiAgentTerminalToolResult('run_registered_query', output))
  })

  test('keeps permission denials and write errors terminal', ({ assert }) => {
    assert.isFalse(
      isRecoverableAiAgentReadToolError('run_registered_query', {
        kind: 'query_error',
        code: 'permission_denied',
      })
    )
    assert.isTrue(
      isAiAgentTerminalToolResult('run_registered_query', {
        kind: 'query_error',
        code: 'permission_denied',
      })
    )
    assert.isTrue(
      isAiAgentTerminalToolResult('propose_system_management_change', {
        kind: 'action_error',
        code: 'failed',
      })
    )
  })
})
