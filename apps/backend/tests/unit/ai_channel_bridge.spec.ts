import { test } from '@japa/runner'

import {
  AiChannelBridge,
  createAiChannelCandidateBuffer,
  getAssistantContentFromDoneEvent,
} from '#channels/ai_channel_bridge'
import type { ChannelAdapter } from '#channels/channel_types'
import User from '#models/user'

test.group('AI channel bridge', () => {
  test('reads the persisted final assistant response from a done event', ({ assert }) => {
    assert.equal(
      getAssistantContentFromDoneEvent({ message: { content: '磁盘可用空间为 20 GiB。' } }),
      '磁盘可用空间为 20 GiB。'
    )
    assert.isNull(getAssistantContentFromDoneEvent({ message: null }))
  })

  test('accumulates and commits candidate deltas only for their model call', ({ assert }) => {
    const candidates = createAiChannelCandidateBuffer()

    assert.equal(candidates.append('model-1', '第一段'), '第一段')
    assert.equal(candidates.append('model-1', '第二段'), '第一段第二段')
    assert.isFalse(candidates.clear('stale-model'))
    assert.equal(candidates.commit('model-1'), '第一段第二段')
    assert.equal(candidates.append('model-2', '新候选'), '新候选')
    assert.isTrue(candidates.clear('model-2'))
    assert.isNull(candidates.commit('model-2'))
  })

  test('refuses card actions when the guest principal lookup fails', async ({ assert }) => {
    const adapter: ChannelAdapter = {
      channel: 'wecom',
      tenantId: 'test-tenant',
      async start() {},
      async stop() {},
      async send() {},
    }
    const bridge = new AiChannelBridge(adapter)
    const originalFindByDescriptor = Object.getOwnPropertyDescriptor(User, 'findBy')
    Object.defineProperty(User, 'findBy', {
      configurable: true,
      value: async () => {
        throw new Error('database unavailable')
      },
    })

    try {
      const reply = await bridge.handleTemplateCardEvent({
        channel: 'wecom',
        externalTenantId: 'test-tenant',
        externalUserId: 'external-user',
        conversationKey: 'group-chat',
        actionKey: 'confirm:1',
        taskId: '1',
      })

      assert.deepEqual(reply, {
        kind: 'text',
        content: '确认操作暂时不可用，请稍后重试或联系管理员。',
      })
    } finally {
      if (originalFindByDescriptor) {
        Object.defineProperty(User, 'findBy', originalFindByDescriptor)
      } else {
        Reflect.deleteProperty(User, 'findBy')
      }
    }
  })
})
