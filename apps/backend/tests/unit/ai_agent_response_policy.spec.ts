import { test } from '@japa/runner'

import { resolveGroundedAssistantResponse } from '#services/ai_agent_response_policy'

test.group('AI agent response policy', () => {
  test('replaces an ungrounded model response with the supported scope', ({ assert }) => {
    const response = resolveGroundedAssistantResponse({
      content: '最小权限原则是……',
      completedToolNames: new Set(),
    })

    assert.notEqual(response, '最小权限原则是……')
    assert.include(response, '已发布知识文档')
  })

  test('keeps a response that follows a completed tool call', ({ assert }) => {
    assert.equal(
      resolveGroundedAssistantResponse({
        content: '请先执行 pnpm install。',
        completedToolNames: new Set(['search_knowledge']),
      }),
      '请先执行 pnpm install。'
    )
  })
})
