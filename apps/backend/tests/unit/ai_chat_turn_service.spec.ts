import { test } from '@japa/runner'

import {
  getTerminalToolAssistantContent,
  markConfirmationNarrationFailure,
} from '#ai/chat/ai_chat_turn_service'
import type { AiChatRuntimeDetail } from '#models/ai_chat_message'

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

  test('marks a confirmation tool failed when its user-facing narration is unavailable', ({
    assert,
  }) => {
    const runtimeDetails: AiChatRuntimeDetail[] = [
      {
        kind: 'tool',
        name: 'run_registered_query',
        state: 'running',
        phase: 'awaiting_confirmation',
      },
    ]

    assert.equal(
      markConfirmationNarrationFailure(runtimeDetails),
      '我暂时无法生成清晰的操作说明，因此没有创建待确认操作。请稍后重试。'
    )
    assert.deepEqual(runtimeDetails[0], {
      kind: 'tool',
      name: 'run_registered_query',
      state: 'error',
      phase: 'failed',
      message: '无法生成操作说明，待确认操作未创建。',
    })
  })
})
