import { test } from '@japa/runner'

import type { OutboundMessage } from '#channels/channel_types'
import { FeishuBotAdapter, getSafeFeishuErrorDetails } from '#channels/feishu/feishu_bot_adapter'

test.group('Feishu bot reply', () => {
  test('sends an ordinary typing status before processing and the final reply after', async ({
    assert,
  }) => {
    const order: string[] = []
    const messages: OutboundMessage[] = []
    const adapter = new FeishuBotAdapter({
      appId: 'test-app',
      secret: 'test-secret',
      onMessage: async () => {
        order.push('process')
        return { kind: 'text', content: '你好，我来帮你。' }
      },
    })
    adapter.send = async (_target, outbound) => {
      order.push('send')
      messages.push(outbound)
    }
    const internals = adapter as unknown as {
      handleMessage: (event: unknown) => Promise<void>
    }

    await internals.handleMessage({
      tenant_key: 'feishu',
      sender: { sender_id: { open_id: 'user-1' }, sender_type: 'user' },
      message: {
        message_id: 'message-1',
        chat_id: 'chat-1',
        chat_type: 'p2p',
        message_type: 'text',
        content: JSON.stringify({ text: '你好' }),
        create_time: '1792924800',
      },
    })

    assert.deepEqual(order, ['send', 'process', 'send'])
    assert.deepEqual(messages, [
      { kind: 'text', content: '正在输入……' },
      { kind: 'text', content: '你好，我来帮你。' },
    ])
  })

  test('omits Axios request headers from logged error details', ({ assert }) => {
    const error = Object.assign(new Error('Request failed with status code 400'), {
      code: 'ERR_BAD_REQUEST',
      config: { headers: { Authorization: 'Bearer secret-token' } },
      response: {
        status: 400,
        data: { code: 99991672, error: { log_id: 'feishu-log-id' } },
      },
    })

    const details = getSafeFeishuErrorDetails(error)
    assert.equal(details.apiCode, 99991672)
    assert.equal(details.apiLogId, 'feishu-log-id')
    assert.notInclude(JSON.stringify(details), 'secret-token')
    assert.notInclude(JSON.stringify(details), 'config')
  })
})
