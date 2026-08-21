import AiBot, {
  DefaultLogger,
  generateReqId,
  type SendMarkdownMsgBody,
  type SendTemplateCardMsgBody,
  type TemplateCard,
  type WSClientOptions,
  type WsFrame,
} from '@wecom/aibot-node-sdk'

import type {
  ChannelAdapter,
  ChannelTarget,
  NormalizedInboundMessage,
  OutboundMessage,
} from '#channels/channel_types'

export interface WecomBotAdapterOptions {
  tenantId: string
  botId: string
  secret: string
  wsUrl?: string
  onMessage: (message: NormalizedInboundMessage) => Promise<OutboundMessage | void>
  onTemplateCardEvent?: (input: {
    externalUserId: string
    conversationKey: string
    eventKey: string
    taskId: string
  }) => Promise<OutboundMessage | void>
  logger?: WSClientOptions['logger']
}

/**
 * Enterprise WeCom intelligent-bot WebSocket adapter.
 *
 * This class deliberately stops at channel normalization. The callback is
 * responsible for resolving the bound system user and invoking the shared AI
 * assistant service.
 */
export class WecomBotAdapter implements ChannelAdapter {
  readonly channel = 'wecom' as const
  readonly tenantId: string
  private readonly client: InstanceType<typeof AiBot.WSClient>
  private started = false

  constructor(private readonly options: WecomBotAdapterOptions) {
    this.tenantId = options.tenantId
    this.client = new AiBot.WSClient({
      botId: options.botId,
      secret: options.secret,
      wsUrl: options.wsUrl,
      maxReconnectAttempts: -1,
      logger: options.logger ?? new DefaultLogger('wecom-bot'),
    })

    this.client.on('message.text', (frame) => {
      void this.handleText(frame).catch((error) => this.logHandlerError(error))
    })
    this.client.on('message.voice', (frame) => {
      void this.handleVoice(frame).catch((error) => this.logHandlerError(error))
    })
    this.client.on('event.template_card_event', (frame) => {
      void this.handleTemplateCardEvent(frame).catch((error) => this.logHandlerError(error))
    })
  }

  async start() {
    if (this.started) return
    this.started = true
    this.client.connect()
  }

  async stop() {
    if (!this.started) return
    this.started = false
    this.client.disconnect()
  }

  async send(target: ChannelTarget, message: OutboundMessage) {
    if (target.channel !== this.channel) {
      throw new Error(`Unsupported channel target: ${target.channel}`)
    }

    if (message.kind === 'text') {
      const body: SendMarkdownMsgBody = {
        msgtype: 'markdown',
        markdown: { content: message.content },
      }
      await this.client.sendMessage(target.conversationKey, body)
      return
    }

    await this.client.sendMessage(target.conversationKey, {
      msgtype: 'template_card',
      template_card: this.toTemplateCard(message),
    } satisfies SendTemplateCardMsgBody)
  }

  private toTemplateCard(
    message: Extract<OutboundMessage, { kind: 'confirmation' }>
  ): TemplateCard {
    return {
      card_type: 'button_interaction',
      main_title: { title: message.title },
      sub_title_text: message.description,
      task_id: message.confirmationId,
      button_list: [
        { text: message.confirmLabel, key: `confirm:${message.confirmationId}`, style: 1 },
        { text: message.cancelLabel, key: `cancel:${message.confirmationId}`, style: 2 },
      ],
    }
  }

  private async handleText(frame: WsFrame) {
    const body = frame.body
    if (!body?.from?.userid || !body.text?.content) return

    try {
      const reply = await this.options.onMessage({
        channel: this.channel,
        externalTenantId: this.options.tenantId,
        externalUserId: body.from.userid,
        conversationKey: body.chatid ?? body.from.userid,
        messageId: body.msgid,
        messageType: 'text',
        content: body.text.content,
        receivedAt: new Date(),
        raw: frame,
      })
      if (reply) {
        if (reply.kind === 'confirmation') {
          await this.client.replyTemplateCard(frame, this.toTemplateCard(reply))
          return
        }
        await this.send(
          {
            channel: this.channel,
            externalTenantId: this.options.tenantId,
            conversationKey: body.chatid ?? body.from.userid,
          },
          reply
        )
      }
    } catch (error) {
      this.logHandlerError(error)
      await this.send(
        {
          channel: this.channel,
          externalTenantId: this.options.tenantId,
          conversationKey: body.chatid ?? body.from.userid,
        },
        { kind: 'text', content: '本次请求处理失败，请稍后重试。' }
      )
    }
  }

  private async handleVoice(frame: WsFrame) {
    const body = frame.body
    if (!body?.from?.userid || !body.voice?.content) return

    const reply = await this.options.onMessage({
      channel: this.channel,
      externalTenantId: this.options.tenantId,
      externalUserId: body.from.userid,
      conversationKey: body.chatid ?? body.from.userid,
      messageId: body.msgid,
      messageType: 'voice',
      content: body.voice.content,
      receivedAt: new Date(),
      raw: frame,
    })
    if (reply) {
      if (reply.kind === 'confirmation') {
        await this.client.replyTemplateCard(frame, this.toTemplateCard(reply))
        return
      }
      await this.send(
        {
          channel: this.channel,
          externalTenantId: this.options.tenantId,
          conversationKey: body.chatid ?? body.from.userid,
        },
        reply
      )
    }
  }

  private async handleTemplateCardEvent(frame: WsFrame) {
    const body = frame.body
    const eventEnvelope = body?.event
    const event = eventEnvelope?.template_card_event ?? eventEnvelope
    if (
      !body?.from?.userid ||
      !event ||
      (eventEnvelope?.eventtype !== 'template_card_event' && !eventEnvelope?.template_card_event)
    ) {
      return
    }
    if (!event.event_key || !event.task_id || !this.options.onTemplateCardEvent) return

    try {
      await this.client.updateTemplateCard(frame, {
        card_type: 'text_notice',
        main_title: { title: '操作处理中' },
        sub_title_text: '系统正在执行并核验操作结果，请稍候。',
        task_id: event.task_id,
      })
    } catch (error) {
      this.logHandlerError(error)
    }

    const reply = await this.options.onTemplateCardEvent({
      externalUserId: body.from.userid,
      conversationKey: body.chatid ?? body.from.userid,
      eventKey: event.event_key,
      taskId: event.task_id,
    })
    if (reply) {
      await this.send(
        {
          channel: this.channel,
          externalTenantId: this.options.tenantId,
          conversationKey: body.chatid ?? body.from.userid,
        },
        reply
      )
    }
  }

  private logHandlerError(error: unknown) {
    this.options.logger?.error(
      error instanceof Error ? error.message : 'WeCom bot message handler failed'
    )
  }

  createStreamId() {
    return generateReqId('ai')
  }
}
