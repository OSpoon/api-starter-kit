import { test } from '@japa/runner'

import {
  isAiAgentTerminalToolResult,
  isRecoverableAiAgentReadToolError,
  sanitizeAiAgentToolErrorMessage,
} from '#ai/core/ai_agent_tool_errors'

test.group('AI agent read tool errors', () => {
  test('sanitizes and bounds tool error messages for display', ({ assert }) => {
    assert.equal(
      sanitizeAiAgentToolErrorMessage('Request failed. Bearer abc token="secret-value"'),
      'Request failed. Bearer [redacted] token=[redacted]'
    )
    assert.lengthOf(sanitizeAiAgentToolErrorMessage('x'.repeat(300)) ?? '', 240)
    assert.isUndefined(sanitizeAiAgentToolErrorMessage('\nNo detail'))
  })

  test('allows the agent to recover from a read failure', ({ assert }) => {
    const output = { kind: 'query_error', code: 'failed', message: 'temporary failure' }

    assert.isTrue(isRecoverableAiAgentReadToolError('run_registered_query', output))
    assert.isFalse(isAiAgentTerminalToolResult('run_registered_query', output))
    assert.isTrue(isRecoverableAiAgentReadToolError('mcp_read_2_lookup_12345678', output))
    assert.isFalse(isAiAgentTerminalToolResult('mcp_read_2_lookup_12345678', output))
    assert.isFalse(isRecoverableAiAgentReadToolError('mcp_confirm_2_lookup_12345678', output))
    assert.isTrue(isAiAgentTerminalToolResult('mcp_confirm_2_lookup_12345678', output))
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
      isAiAgentTerminalToolResult('system_management_change', {
        kind: 'action_error',
        code: 'failed',
      })
    )
  })
})
