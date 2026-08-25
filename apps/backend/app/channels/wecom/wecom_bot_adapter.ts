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
  ChannelCardActionEvent,
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
  onMessageStream?: (
    message: NormalizedInboundMessage,
    emit: (content: string) => Promise<void>
  ) => Promise<OutboundMessage | void>
  onTemplateCardEvent?: (input: ChannelCardActionEvent) => Promise<OutboundMessage | void>
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
  private readonly logger: NonNullable<WSClientOptions['logger']>
  private started = false

  constructor(private readonly options: WecomBotAdapterOptions) {
    this.tenantId = options.tenantId
    this.logger = options.logger ?? new DefaultLogger('wecom-bot')
    this.client = new AiBot.WSClient({
      botId: options.botId,
      secret: options.secret,
      wsUrl: options.wsUrl,
      maxReconnectAttempts: -1,
      logger: this.logger,
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
      const message: NormalizedInboundMessage = {
        channel: this.channel,
        conversationType: body.chatid ? 'group' : 'direct',
        externalTenantId: this.options.tenantId,
        externalUserId: body.from.userid,
        conversationKey: body.chatid ?? body.from.userid,
        messageId: body.msgid,
        messageType: 'text',
        content: body.text.content,
        receivedAt: new Date(),
        raw: frame,
      }
      if (this.options.onMessageStream) {
        await this.handleStreamingReply(frame, message)
        return
      }
      const reply = await this.options.onMessage(message)
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

  private async handleStreamingReply(frame: WsFrame, message: NormalizedInboundMessage) {
    const streamId = this.createStreamId()
    let latestContent = '正在输入……'
    await this.client.replyStream(frame, streamId, latestContent, false)

    try {
      const reply = await this.options.onMessageStream!(message, async (content) => {
        latestContent = content || latestContent
        await this.client.replyStream(frame, streamId, latestContent, false)
      })
      this.logger.info(
        `WeCom stream handler completed: kind=${reply?.kind ?? 'none'}, conversation=${message.conversationKey}`
      )
      if (reply?.kind === 'confirmation') {
        this.logger.info(
          `Confirmation card prepared: id=${reply.confirmationId}, conversation=${message.conversationKey}`
        )
        await this.sendConfirmationCard(
          frame,
          streamId,
          message.conversationKey,
          latestContent || '请在下方确认卡片中确认操作。',
          reply
        )
        return
      }
      await this.client.replyStream(
        frame,
        streamId,
        reply?.kind === 'text' ? reply.content : latestContent,
        true
      )
    } catch (error) {
      this.logHandlerError(error)
      await this.client.replyStream(frame, streamId, '本次请求处理失败，请稍后重试。', true)
    }
  }

  private async sendConfirmationCard(
    frame: WsFrame,
    streamId: string,
    conversationKey: string,
    content: string,
    message: Extract<OutboundMessage, { kind: 'confirmation' }>
  ) {
    this.logger.info(
      `Sending confirmation card: id=${message.confirmationId}, conversation=${conversationKey}, streamId=${streamId}`
    )
    try {
      // Finish the text stream first. Some WeCom clients acknowledge a
      // template card embedded in the final stream frame but do not render it.
      await this.client.replyStream(frame, streamId, content, true)
      await this.client.replyTemplateCard(frame, this.toTemplateCard(message))
      this.logger.info(
        `Confirmation card sent as a separate reply: id=${message.confirmationId}, conversation=${conversationKey}`
      )
    } catch (error) {
      this.logger.warn(
        `Confirmation card stream send failed: id=${message.confirmationId}, conversation=${conversationKey}`
      )
      this.logHandlerError(error)
      try {
        await this.send(
          {
            channel: this.channel,
            externalTenantId: this.options.tenantId,
            conversationKey,
          },
          message
        )
        this.logger.info(
          `Confirmation card sent proactively: id=${message.confirmationId}, conversation=${conversationKey}`
        )
      } catch (fallbackError) {
        this.logHandlerError(fallbackError)
        throw new Error(`确认卡片发送失败（confirmationId=${message.confirmationId}）`)
      }
    }
  }

  private async handleVoice(frame: WsFrame) {
    const body = frame.body
    if (!body?.from?.userid || !body.voice?.content) return

    const reply = await this.options.onMessage({
      channel: this.channel,
      conversationType: body.chatid ? 'group' : 'direct',
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

    this.logger.info(
      `Template card action received: eventKey=${event.event_key}, taskId=${event.task_id}`
    )

    const reply = await this.options.onTemplateCardEvent({
      externalUserId: body.from.userid,
      conversationKey: body.chatid ?? body.from.userid,
      actionKey: event.event_key,
      taskId: event.task_id,
      channel: this.channel,
      externalTenantId: this.tenantId,
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
