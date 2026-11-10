import { test } from '@japa/runner'

import {
  createFinalResponseState,
  restoreAgentSessionState,
  upsertAgentToolResult,
} from '#ai/agent'

test.group('agent session state', () => {
  test('restores legacy message arrays into the versioned Pi session state', ({ assert }) => {
    assert.deepEqual(
      restoreAgentSessionState([
        { role: 'user', content: 'hello', timestamp: 1, sourceMessageId: 10 },
      ]),
      {
        engineId: 'pi',
        version: 1,
        messages: [{ role: 'user', content: 'hello', timestamp: 1, sourceMessageId: 10 }],
      }
    )
  })

  test('upserts a bounded tool result and redacts sensitive output', ({ assert }) => {
    const state = upsertAgentToolResult(
      [
        {
          role: 'toolResult',
          toolCallId: 'call-1',
          toolName: 'search_knowledge',
          content: [{ type: 'text', text: 'Waiting for confirmation.' }],
          isError: true,
          timestamp: 1,
        },
      ],
      {
        assistantMessageId: 12,
        toolCallId: 'call-1',
        toolName: 'search_knowledge',
        text: JSON.stringify({ password: 'sensitive', available: 82 }),
        isError: false,
      }
    )

    assert.equal(state.messages.length, 1)
    assert.equal(state.messages[0].sourceMessageId, 12)
    assert.deepEqual(state.messages[0].content, [
      { type: 'text', text: '{"password":"[redacted]","available":82}' },
    ])

    const oversized = upsertAgentToolResult(null, {
      assistantMessageId: 12,
      toolCallId: 'call-2',
      toolName: 'large_result',
      text: 'x'.repeat(20_010),
      isError: false,
    }).messages[0]
    const truncatedText = oversized.content[0] as { type: 'text'; text: string }
    assert.isTrue(truncatedText.text.endsWith('[结果已截断]'))
    assert.isAtMost(truncatedText.text.length, 20_020)
  })

  test('removes the latest user message and final draft while retaining tool results', ({
    assert,
  }) => {
    const state = createFinalResponseState(
      [
        { role: 'user', content: 'check disk', timestamp: 1, sourceMessageId: 42 },
        {
          role: 'assistant',
          content: [{ type: 'toolCall', id: 'call-1', name: 'get_disk_info', arguments: {} }],
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
          timestamp: 4,
        },
      ],
      42
    )

    assert.deepEqual(
      state.messages.map((message) => message.role),
      ['assistant', 'toolResult']
    )
    assert.deepEqual(state.messages[1].content, [{ type: 'text', text: 'available: 72 GiB' }])
  })
})
