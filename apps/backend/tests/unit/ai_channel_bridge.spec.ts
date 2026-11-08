import { test } from '@japa/runner'

import { AiChannelBridge, getAssistantContentFromDoneEvent } from '#channels/ai_channel_bridge'
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
