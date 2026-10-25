import { test } from '@japa/runner'

import type { NormalizedInboundMessage, OutboundMessage } from '#channels/channel_types'
import { DingTalkBotAdapter } from '#channels/dingtalk/dingtalk_bot_adapter'

const confirmation: OutboundMessage = {
  kind: 'confirmation',
  title: '确认调用 MCP 工具',
  description: '请确认是否执行以下操作。',
  confirmationId: '42',
  confirmLabel: '确认执行',
  cancelLabel: '取消',
}

const robotMessage = {
  conversationId: 'conversation-1',
  conversationType: '1',
  senderStaffId: 'user-1',
  senderId: 'user-1',
  sessionWebhook: 'https://session.example/reply',
}

const normalizedMessage: NormalizedInboundMessage = {
  channel: 'dingtalk',
  conversationType: 'direct',
  externalTenantId: 'tenant-1',
  externalUserId: 'user-1',
  conversationKey: 'conversation-1',
  messageId: 'message-1',
  messageType: 'text',
  content: '查询最新日志',
  receivedAt: new Date(),
}

type AdapterInternals = {
  client: {
    getAccessToken: () => Promise<string>
    socketCallBackResponse: (...args: unknown[]) => void
  }
  conversations: Map<
    string,
    { message: { sessionWebhook: string }; externalTenantId: string; expiresAt: number }
  >
  handleStreamingReply: (
    message: typeof robotMessage,
    normalized: NormalizedInboundMessage
  ) => Promise<OutboundMessage | void>
  handleCardEvent: (event: {
    data: string
    headers: { messageId: string; eventCorpId: string }
  }) => Promise<void>
}

function internals(adapter: DingTalkBotAdapter) {
  return adapter as unknown as AdapterInternals
}

function createAdapter(
  onMessageStream: NonNullable<
    ConstructorParameters<typeof DingTalkBotAdapter>[0]['onMessageStream']
  >
) {
  return new DingTalkBotAdapter({
    clientId: 'test-client',
    clientSecret: 'test-secret',
    streamingCardTemplateId: 'stream-template',
    onMessage: async () => undefined,
    onMessageStream,
    onTemplateCardEvent: async () => ({ kind: 'text', content: '确认后的独立结果' }),
  })
}

test.group('DingTalk streaming reply', () => {
  test('updates the typing card with the generated preamble and sends the result separately', async ({
    assert,
  }) => {
    const originalFetch = globalThis.fetch
    const requests: Array<{ url: string; init?: RequestInit }> = []
    globalThis.fetch = async (input, init) => {
      requests.push({ url: String(input), init })
      return new Response('{"success":true}', { status: 200 })
    }

    try {
      const adapter = createAdapter(async (_message, emit) => {
        await emit('我来帮您查询最新日志。')
        await new Promise((resolve) => setTimeout(resolve, 270))
        return confirmation
      })
      const state = internals(adapter)
      state.client = {
        getAccessToken: async () => 'test-token',
        socketCallBackResponse: () => undefined,
      }

      const reply = await state.handleStreamingReply(robotMessage, normalizedMessage)
      assert.deepEqual(reply, confirmation)
      assert.lengthOf(requests, 3)
      assert.include(requests[0]?.url, '/v1.0/card/instances/createAndDeliver')
      const initialCard = JSON.parse(String(requests[0]?.init?.body)) as {
        cardData: { cardParamMap: { content: string } }
      }
      assert.equal(initialCard.cardData.cardParamMap.content, '正在输入……')
      assert.equal(requests[1]?.init?.method, 'PUT')
      const streamedCard = JSON.parse(String(requests[1]?.init?.body)) as {
        cardData: { cardParamMap: { content: string } }
      }
      assert.equal(streamedCard.cardData.cardParamMap.content, '我来帮您查询最新日志。')

      state.conversations.set('conversation-1', {
        message: { sessionWebhook: 'https://session.example/reply' },
        externalTenantId: 'tenant-1',
        expiresAt: Date.now() + 60_000,
      })
      await state.handleCardEvent({
        data: JSON.stringify({
          content: JSON.stringify({
            cardPrivateData: {
              params: {
                actionKey: 'confirm:42',
                taskId: '42',
                conversationKey: 'conversation-1',
                externalUserId: 'user-1',
                externalTenantId: 'tenant-1',
              },
            },
          }),
        }),
        headers: { messageId: 'callback-1', eventCorpId: 'tenant-1' },
      })

      assert.lengthOf(requests, 4)
      assert.equal(requests[3]?.url, 'https://session.example/reply')
      assert.lengthOf(
        requests.filter(({ url }) => url.includes('/v1.0/card/instances')),
        3
      )
      const resultReply = JSON.parse(String(requests[3]?.init?.body)) as {
        markdown: { text: string }
      }
      assert.equal(resultReply.markdown.text, '确认后的独立结果')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
