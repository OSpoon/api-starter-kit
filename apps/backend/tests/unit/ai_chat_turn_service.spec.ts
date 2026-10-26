import { test } from '@japa/runner'

import { getTerminalToolAssistantContent } from '#ai/chat/ai_chat_turn_service'

test.group('AI chat terminal tool response', () => {
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
