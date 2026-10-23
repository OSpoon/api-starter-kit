import logger from '@adonisjs/core/services/logger'
import AiBot, {
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
import { LatestContentStream } from '#channels/latest_content_stream'

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
  private readonly log = logger.child({ channel: this.channel })
  private readonly sdkLog = this.log.child({ component: 'wecom_sdk' })
  private readonly client: InstanceType<typeof AiBot.WSClient>
  private readonly logger: NonNullable<WSClientOptions['logger']>
  private started = false
  private rejectStartup: ((error: Error) => void) | null = null

  constructor(private readonly options: WecomBotAdapterOptions) {
    this.tenantId = options.tenantId
    this.logger = options.logger ?? {
      debug: () => undefined,
      info: (message) => this.sdkLog.info(message),
      warn: (message) => this.sdkLog.warn(message),
      error: (message) => this.sdkLog.error(message),
    }
    this.client = new AiBot.WSClient({
      botId: options.botId,
      secret: options.secret,
      wsUrl: options.wsUrl,
      maxReconnectAttempts: -1,
      logger: this.logger,
    })

    this.client.on('message.text', (frame) => {
      void this.handleText(frame).catch((error) =>
        this.logHandlerError(error, {
          eventType: 'message.text',
          messageId: frame.body?.msgid ?? null,
          conversationKey: frame.body?.chatid ?? frame.body?.from?.userid ?? null,
        })
      )
    })
    this.client.on('message.voice', (frame) => {
      void this.handleVoice(frame).catch((error) =>
        this.logHandlerError(error, {
          eventType: 'message.voice',
          messageId: frame.body?.msgid ?? null,
          conversationKey: frame.body?.chatid ?? frame.body?.from?.userid ?? null,
        })
      )
    })
    this.client.on('event.template_card_event', (frame) => {
      void this.handleTemplateCardEvent(frame).catch((error) =>
        this.logHandlerError(error, {
          eventType: 'event.template_card_event',
          messageId: frame.body?.msgid ?? null,
          conversationKey: frame.body?.chatid ?? frame.body?.from?.userid ?? null,
        })
      )
    })
  }

  async start() {
    if (this.started) return
    this.started = true

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const timeout = setTimeout(() => {
        finish(new Error('WebSocket authentication timed out'))
      }, 15_000)
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        this.client.off('authenticated', onAuthenticated)
        this.client.off('error', onError)
        if (this.rejectStartup === cancel) this.rejectStartup = null
        if (error) reject(error)
        else resolve()
      }
      const onAuthenticated = () => {
        this.log.info('WeCom WebSocket authenticated')
        finish()
      }
      const onError = (error: Error) => finish(error)
      const cancel = (error: Error) => finish(error)

      this.rejectStartup = cancel
      this.client.once('authenticated', onAuthenticated)
      this.client.once('error', onError)
      this.client.connect()
    }).catch((error) => {
      this.started = false
      this.client.disconnect()
      throw error
    })
  }

  async stop() {
    if (!this.started) return
    this.started = false
    this.rejectStartup?.(new Error('WebSocket startup cancelled'))
    this.rejectStartup = null
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
      this.logHandlerError(error, {
        operation: 'handle_text_message',
        messageId: body.msgid ?? null,
        conversationKey: body.chatid ?? body.from.userid,
      })
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
    const initialContent = '正在输入……'
    const stream = new LatestContentStream(initialContent, async (content) => {
      await this.client.replyStream(frame, streamId, content, false)
    })
    await this.client.replyStream(frame, streamId, initialContent, false)

    try {
      const reply = await this.options.onMessageStream!(message, async (content) => {
        stream.publish(content)
      })
      const updateError = await stream.finish()
      if (updateError) {
        this.logHandlerError(updateError, {
          operation: 'finish_text_stream',
          messageId: message.messageId,
          conversationKey: message.conversationKey,
        })
        await this.sendFallbackReply(message, reply)
        return
      }
      const latestContent = stream.latest
      this.log.info(
        {
          kind: reply?.kind ?? 'none',
          conversationKey: message.conversationKey,
        },
        'WeCom stream handler completed'
      )
      if (reply?.kind === 'confirmation') {
        this.log.info(
          {
            confirmationId: reply.confirmationId,
            conversationKey: message.conversationKey,
          },
          'WeCom confirmation card prepared'
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
      this.logHandlerError(error, {
        operation: 'handle_streaming_reply',
        messageId: message.messageId,
        conversationKey: message.conversationKey,
      })
      await stream.finish()
      await this.sendFallbackReply(message, {
        kind: 'text',
        content: '本次请求处理失败，请稍后重试。',
      })
    }
  }

  private async sendFallbackReply(
    message: NormalizedInboundMessage,
    reply: OutboundMessage | void
  ) {
    if (reply) {
      await this.send(
        {
          channel: this.channel,
          externalTenantId: message.externalTenantId,
          conversationKey: message.conversationKey,
        },
        reply
      )
      return
    }
    await this.send(
      {
        channel: this.channel,
        externalTenantId: message.externalTenantId,
        conversationKey: message.conversationKey,
      },
      { kind: 'text', content: '本次请求处理失败，请稍后重试。' }
    )
  }

  private async sendConfirmationCard(
    frame: WsFrame,
    streamId: string,
    conversationKey: string,
    content: string,
    message: Extract<OutboundMessage, { kind: 'confirmation' }>
  ) {
    this.log.info(
      { confirmationId: message.confirmationId, conversationKey, streamId },
      'Sending WeCom confirmation card'
    )
    try {
      // Finish the text stream first. Some WeCom clients acknowledge a
      // template card embedded in the final stream frame but do not render it.
      await this.client.replyStream(frame, streamId, content, true)
      await this.client.replyTemplateCard(frame, this.toTemplateCard(message))
      this.log.info(
        { confirmationId: message.confirmationId, conversationKey },
        'WeCom confirmation card sent as a separate reply'
      )
    } catch (error) {
      this.log.warn(
        { confirmationId: message.confirmationId, conversationKey },
        'WeCom confirmation card stream send failed; trying a proactive reply'
      )
      this.logHandlerError(error, {
        operation: 'send_confirmation_card_stream',
        confirmationId: message.confirmationId,
        conversationKey,
        streamId,
      })
      try {
        await this.send(
          {
            channel: this.channel,
            externalTenantId: this.options.tenantId,
            conversationKey,
          },
          message
        )
        this.log.info(
          { confirmationId: message.confirmationId, conversationKey },
          'WeCom confirmation card sent proactively'
        )
      } catch (fallbackError) {
        this.logHandlerError(fallbackError, {
          operation: 'send_confirmation_card_fallback',
          confirmationId: message.confirmationId,
          conversationKey,
          streamId,
        })
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

    this.log.info(
      {
        eventKey: event.event_key,
        taskId: event.task_id,
        conversationKey: body.chatid ?? body.from.userid,
      },
      'WeCom template card action received'
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

  private logHandlerError(error: unknown, context: Record<string, unknown>) {
    this.log.error({ err: error, ...context }, 'WeCom bot operation failed')
  }

  createStreamId() {
    return generateReqId('ai')
  }
}
