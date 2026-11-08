import { test } from '@japa/runner'

import { buildAiChatHistoryQuery } from '#ai/chat/turn/ai_chat_turn_context'
import { getTerminalToolAssistantContent } from '#ai/chat/turn/ai_chat_turn_service'

test.group('AI chat terminal tool response', () => {
  test('omits the summary boundary filter when a new conversation has no boundary yet', ({
    assert,
  }) => {
    const { sql, bindings } = buildAiChatHistoryQuery(12, undefined).toSQL()

    assert.notInclude(sql, '"id" =')
    assert.deepEqual(bindings, [12])
  })

  test('filters history after an existing summary boundary', ({ assert }) => {
    const { sql, bindings } = buildAiChatHistoryQuery(12, 34).toSQL()

    assert.include(sql, '"id" >')
    assert.deepEqual(bindings, [12, 34])
  })

  test('replaces a failed managed action preamble with its actual error', ({ assert }) => {
    assert.equal(
      getTerminalToolAssistantContent(
        { kind: 'action_error', message: '该 API Key 已被吊销，请改用删除操作' },
        'revoke_api_key',
        true
      ),
      '操作未完成：该 API Key 已被吊销，请改用删除操作'
    )
  })
})
