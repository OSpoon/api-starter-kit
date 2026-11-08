import { test } from '@japa/runner'

import {
  createAiAgentFinalResponseContext,
  upsertAiAgentToolResult,
} from '#ai/runtime/ai_agent_session_context'

test.group('AI agent session context', () => {
  test('replaces the pending tool result and redacts sensitive output', ({ assert }) => {
    const context = upsertAiAgentToolResult(
      [
        {
          role: 'toolResult',
          toolCallId: 'call-1',
          toolName: 'mcp_read_system_info__get_disk_info',
          content: [{ type: 'text', text: 'Waiting for confirmation.' }],
          isError: true,
          timestamp: 1,
        },
      ],
      {
        assistantMessageId: 12,
        toolCallId: 'call-1',
        toolName: 'mcp_read_system_info__get_disk_info',
        text: '{"password":"sensitive","available":82}',
        isError: false,
      }
    )

    assert.lengthOf(context, 1)
    assert.deepInclude(context[0], {
      role: 'toolResult',
      toolCallId: 'call-1',
      toolName: 'mcp_read_system_info__get_disk_info',
      isError: false,
      sourceMessageId: 12,
    })
    assert.deepEqual(context[0].content, [
      { type: 'text', text: '{"password":"[redacted]","available":82}' },
    ])
  })

  test('bounds persisted tool results', ({ assert }) => {
    const context = upsertAiAgentToolResult([], {
      assistantMessageId: 12,
      toolCallId: 'call-2',
      toolName: 'get_large_result',
      text: 'x'.repeat(20_010),
      isError: false,
    })
    const result = context[0]

    assert.equal(result?.role, 'toolResult')
    if (result?.role === 'toolResult') {
      const text = result.content.find((item) => item.type === 'text')
      assert.isTrue(text?.type === 'text' && text.text.endsWith('[结果已截断]'))
      assert.isAtMost(text?.type === 'text' ? text.text.length : Number.POSITIVE_INFINITY, 20_020)
    }
  })

  test('keeps tool results but removes the latest user message and assistant draft', ({
    assert,
  }) => {
    const context = createAiAgentFinalResponseContext(
      [
        {
          role: 'user',
          content: '查一下磁盘空间',
          timestamp: 1,
          sourceMessageId: 42,
        },
        {
          role: 'assistant',
          content: [{ type: 'toolCall', id: 'call-1', name: 'get_disk_info', arguments: {} }],
          api: 'openai-completions',
          provider: 'test-provider',
          model: 'test-model',
          stopReason: 'toolUse',
          usage: {},
          timestamp: 2,
        },
        {
          role: 'toolResult',
          toolCallId: 'call-1',
          toolName: 'get_disk_info',
          content: [{ type: 'text', text: 'available: 72 GiB' }],
          isError: false,
          timestamp: 3,
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Intermediate draft.' }],
          api: 'openai-completions',
          provider: 'test-provider',
          model: 'test-model',
          stopReason: 'stop',
          usage: {},
          timestamp: 4,
        },
      ],
      42
    )

    assert.deepEqual(
      context.map((message) => message.role),
      ['assistant', 'toolResult']
    )
    const toolResult = context[1]
    assert.equal(toolResult?.role, 'toolResult')
    if (toolResult?.role === 'toolResult') {
      assert.deepEqual(toolResult.content, [{ type: 'text', text: 'available: 72 GiB' }])
    }
  })
})
