import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import logger from '@adonisjs/core/services/logger'
import * as Lark from '@larksuiteoapi/node-sdk'

import type {
  ChannelAdapter,
  ChannelCardActionEvent,
  ChannelTarget,
  NormalizedInboundMessage,
  OutboundMessage,
} from '#channels/channel_types'
import { formatConfirmationDetails } from '#channels/confirmation_details'
import { LatestContentStream } from '#channels/latest_content_stream'
import { getAudioMimeType, transcribeAudio } from '#services/ai_speech_service'

export interface FeishuBotAdapterOptions {
  appId: string
  secret: string
  tenantId?: string
  domain?: string
  onMessage: (message: NormalizedInboundMessage) => Promise<OutboundMessage | void>
  onMessageStream?: (
    message: NormalizedInboundMessage,
    emit: (content: string) => Promise<void>
  ) => Promise<OutboundMessage | void>
  onTemplateCardEvent?: (input: ChannelCardActionEvent) => Promise<OutboundMessage | void>
}

type FeishuMessageEvent = Parameters<
  NonNullable<Parameters<Lark.EventDispatcher['register']>[0]['im.message.receive_v1']>
>[0]
type FeishuSdkLogger = NonNullable<ConstructorParameters<typeof Lark.EventDispatcher>[0]['logger']>

interface FeishuCardActionEvent {
  action?: { value?: unknown }
  operator?: { open_id?: string }
  tenant_key?: string
  context?: { open_chat_id?: string }
  open_chat_id?: string
}

function parseTextContent(content: string) {
  try {
    const value = JSON.parse(content) as { text?: unknown }
    return typeof value.text === 'string' ? value.text : content
  } catch {
    return content
  }
}

function parseMessageContent(content: string) {
  try {
    const value = JSON.parse(content) as Record<string, unknown>
    return value
  } catch {
    return {}
  }
}

function readAudioTranscript(content: Record<string, unknown>) {
  for (const key of ['recognition', 'transcript', 'transcription']) {
    const value = content[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function hasMissingCardKitPermission(error: unknown) {
  const source = asRecord(error)
  const response = asRecord(source?.response)
  const data = asRecord(response?.data)
  const providerError = asRecord(data?.error)
  if (data?.code !== 99991672) return false

  const violations = JSON.stringify(providerError?.permission_violations ?? [])
  return /cardkit:card:write/.test(
    [data.msg, providerError?.message, violations].filter(Boolean).join(' ')
  )
}

function buildStreamingCard() {
  return {
    schema: '2.0',
    config: {
      streaming_mode: true,
      summary: { content: '[Generating...]' },
      streaming_config: {
        print_frequency_ms: { default: 70 },
        print_step: { default: 1 },
        print_strategy: 'fast',
      },
    },
    body: {
      elements: [{ tag: 'markdown', element_id: 'stream_md', content: '正在输入……' }],
    },
  }
}

function cardSummary(content: string) {
  const summary = content.replace(/\s+/g, ' ').trim()
  return summary.length <= 50 ? summary : `${summary.slice(0, 49)}…`
}

export function getSafeFeishuErrorDetails(error: unknown) {
  const source = asRecord(error)
  const response = asRecord(source?.response)
  const data = asRecord(response?.data)
  const providerError = asRecord(data?.error)
  const message = error instanceof Error ? error.message : 'Unknown Feishu error'
  return {
    name: error instanceof Error ? error.name : 'Error',
    message: message
      .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
      .replace(/(authorization|token|secret|api[ _-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
      .slice(0, 500),
    ...(typeof source?.code === 'string' ? { code: source.code } : {}),
    ...(typeof response?.status === 'number' ? { status: response.status } : {}),
    ...(typeof data?.code === 'number' ? { apiCode: data.code } : {}),
    ...(typeof providerError?.log_id === 'string' ? { apiLogId: providerError.log_id } : {}),
  }
}

export class FeishuBotAdapter implements ChannelAdapter {
  readonly channel = 'feishu' as const
  readonly tenantId: string
  private readonly log = logger.child({ channel: this.channel })
  private readonly sdkLog = this.log.child({ component: 'feishu_sdk' })
  private readonly client: Lark.Client
  private readonly wsClient: Lark.WSClient
  private readonly sdkLogger: FeishuSdkLogger
  private started = false
  private resolveStartup: (() => void) | null = null
  private rejectStartup: ((error: Error) => void) | null = null
  private readonly handledMessageIds = new Map<string, number>()

  constructor(private readonly options: FeishuBotAdapterOptions) {
    this.tenantId = options.tenantId ?? 'feishu'
    this.sdkLogger = {
      trace: () => undefined,
      debug: () => undefined,
      info: (...args: unknown[]) => this.sdkLog.info(String(args[0] ?? '')),
      warn: (...args: unknown[]) => this.sdkLog.warn(String(args[0] ?? '')),
      error: (...args: unknown[]) => this.sdkLog.error(String(args[0] ?? '')),
    }
    const baseConfig = {
      appId: options.appId,
      appSecret: options.secret,
      domain: options.domain,
    }
    this.client = new Lark.Client(baseConfig)
    this.wsClient = new Lark.WSClient({
      ...baseConfig,
      loggerLevel: Lark.LoggerLevel.info,
      logger: this.sdkLogger,
      autoReconnect: true,
      onReady: () => {
        this.log.info('Feishu WebSocket authenticated')
        this.resolveStartup?.()
      },
      onError: (error) => this.rejectStartup?.(error),
      onReconnecting: () => this.log.warn('Feishu WebSocket reconnecting'),
    })
  }

  async start() {
    if (this.started) return
    this.started = true
    const eventDispatcher = new Lark.EventDispatcher({
      loggerLevel: Lark.LoggerLevel.info,
      logger: this.sdkLogger,
    }).register({
      'im.message.receive_v1': async (event: FeishuMessageEvent) => {
        this.log.info(
          {
            messageId: event.message.message_id,
            conversationKey: event.message.chat_id,
            messageType: event.message.message_type,
            senderType: event.sender.sender_type,
          },
          'Feishu message event received'
        )
        if (!this.markMessageHandled(event.message.message_id)) {
          this.log.debug(
            { messageId: event.message.message_id },
            'Feishu message event deduplicated'
          )
          return
        }
        void this.handleMessage(event).catch((error) =>
          this.logError(error, {
            eventType: 'im.message.receive_v1',
            messageId: event.message.message_id,
            conversationKey: event.message.chat_id,
          })
        )
      },
      'card.action.trigger': async (event: FeishuCardActionEvent) => {
        void this.handleCardAction(event).catch((error) =>
          this.logError(error, {
            eventType: 'card.action.trigger',
            conversationKey: event.context?.open_chat_id ?? event.open_chat_id ?? null,
            externalUserId: event.operator?.open_id ?? null,
          })
        )
      },
    })
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const timeout = setTimeout(
        () => finish(new Error('Feishu WebSocket authentication timed out')),
        15_000
      )
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        this.resolveStartup = null
        this.rejectStartup = null
        if (error) reject(error)
        else resolve()
      }

      this.resolveStartup = () => finish()
      this.rejectStartup = (error) => finish(error)
      void this.wsClient.start({ eventDispatcher }).catch((error) => finish(error))
    }).catch((error) => {
      this.started = false
      this.wsClient.close({ force: true })
      throw error
    })
  }

  async stop() {
    if (!this.started) return
    this.started = false
    this.rejectStartup?.(new Error('Feishu WebSocket startup cancelled'))
    this.resolveStartup = null
    this.rejectStartup = null
    this.wsClient.close({ force: true })
  }

  async send(target: ChannelTarget, message: OutboundMessage) {
    if (target.channel !== this.channel) {
      throw new Error(`Unsupported channel target: ${target.channel}`)
    }
    const shouldRenderMarkdown = message.kind === 'text' && this.containsMarkdown(message.content)
    await this.client.im.v1.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: target.conversationKey,
        msg_type: message.kind === 'confirmation' || shouldRenderMarkdown ? 'interactive' : 'text',
        content: JSON.stringify(
          message.kind === 'confirmation'
            ? this.toInteractiveCard(message)
            : shouldRenderMarkdown
              ? this.toMarkdownCard(message.content)
              : { text: message.content }
        ),
      },
    })
  }

  private async handleMessage(event: FeishuMessageEvent) {
    const senderId = event.sender.sender_id?.open_id
    if (!senderId) {
      this.log.warn(
        {
          messageId: event.message.message_id,
          conversationKey: event.message.chat_id,
        },
        'Feishu message has no sender open_id'
      )
      return
    }

    const isAudio = event.message.message_type === 'audio'
    let content = isAudio ? '' : parseTextContent(event.message.content)
    if (isAudio) {
      try {
        content = await this.transcribeAudioMessage(event.message.message_id, event.message.content)
      } catch (error) {
        this.log.error(
          {
            err: error,
            messageId: event.message.message_id,
            conversationKey: event.message.chat_id,
          },
          'Feishu audio transcription failed'
        )
        await this.send(
          {
            channel: this.channel,
            externalTenantId: event.tenant_key ?? this.tenantId,
            conversationKey: event.message.chat_id,
          },
          { kind: 'text', content: '语音转写失败，请稍后重试。' }
        )
        return
      }
    }

    const message: NormalizedInboundMessage = {
      channel: this.channel,
      conversationType: event.message.chat_type === 'group' ? 'group' : 'direct',
      externalTenantId: event.tenant_key ?? this.tenantId,
      externalUserId: senderId,
      conversationKey: event.message.chat_id,
      messageId: event.message.message_id,
      messageType: isAudio ? 'voice' : 'text',
      content,
      receivedAt: new Date(Number(event.message.create_time) || Date.now()),
      raw: event,
    }
    this.log.info(
      {
        messageId: message.messageId,
        conversationKey: message.conversationKey,
        externalUserId: message.externalUserId,
        contentLength: message.content.length,
      },
      'Feishu message normalized; handing off to AI bridge'
    )
    const target = {
      channel: this.channel,
      externalTenantId: message.externalTenantId,
      conversationKey: message.conversationKey,
    }
    if (this.options.onMessageStream) {
      await this.handleStreamingReply(message, target)
      return
    }

    await this.send(target, { kind: 'text', content: '正在输入……' })
    await this.sendReply(message, target, await this.options.onMessage(message))
  }

  private async sendReply(
    message: NormalizedInboundMessage,
    target: ChannelTarget,
    reply: OutboundMessage | void
  ) {
    if (!reply) return
    await this.send(target, reply)
    this.log.info(
      { messageId: message.messageId, conversationKey: message.conversationKey, kind: reply.kind },
      'Feishu AI reply sent'
    )
  }

  private async handleStreamingReply(message: NormalizedInboundMessage, target: ChannelTarget) {
    let cardId: string
    try {
      const card = await this.client.cardkit.v1.card.create({
        data: { type: 'card_json', data: JSON.stringify(buildStreamingCard()) },
      })
      cardId = card.data?.card_id ?? ''
      if (!cardId) throw new Error('Feishu CardKit create card returned no card_id')
      await this.client.im.v1.message.create({
        params: { receive_id_type: 'chat_id' },
        data: {
          receive_id: target.conversationKey,
          msg_type: 'interactive',
          content: JSON.stringify({ type: 'card', data: { card_id: cardId } }),
        },
      })
    } catch (error) {
      if (!hasMissingCardKitPermission(error)) throw error
      this.log.warn(
        { errorDetails: getSafeFeishuErrorDetails(error), messageId: message.messageId },
        'Feishu CardKit permission unavailable; falling back to ordinary messages'
      )
      await this.send(target, { kind: 'text', content: '正在输入……' })
      await this.sendReply(message, target, await this.options.onMessage(message))
      return
    }

    let sequence = 0
    const stream = new LatestContentStream('正在输入……', async (content) => {
      await this.updateStreamingCard(cardId, content, ++sequence)
    })
    let reply: OutboundMessage | void
    try {
      reply = await this.options.onMessageStream!(message, async (content) =>
        stream.publish(content)
      )
    } catch (error) {
      await stream.finish()
      this.logError(error, {
        operation: 'stream_reply',
        messageId: message.messageId,
        conversationKey: message.conversationKey,
      })
      try {
        await this.updateStreamingCard(cardId, '本次请求处理失败，请稍后重试。', ++sequence)
        await this.finishStreamingCard(cardId, ++sequence, '本次请求处理失败，请稍后重试。')
      } catch (cardError) {
        this.logError(cardError, {
          operation: 'finalize_failed_stream',
          messageId: message.messageId,
          conversationKey: message.conversationKey,
        })
        await this.send(target, { kind: 'text', content: '本次请求处理失败，请稍后重试。' })
      }
      return
    }

    const finalContent =
      reply?.kind === 'text'
        ? reply.content
        : stream.latest === '正在输入……'
          ? reply?.kind === 'confirmation'
            ? '请在下方确认卡片中确认操作。'
            : 'AI 没有生成可显示的回复。'
          : stream.latest
    await stream.finish()
    try {
      await this.updateStreamingCard(cardId, finalContent, ++sequence)
      await this.finishStreamingCard(cardId, ++sequence, cardSummary(finalContent))
    } catch (error) {
      this.logError(error, {
        operation: 'finalize_stream',
        messageId: message.messageId,
        conversationKey: message.conversationKey,
      })
      await this.sendReply(message, target, reply ?? { kind: 'text', content: finalContent })
      return
    }

    if (reply?.kind === 'confirmation') await this.send(target, reply)
    if (reply) {
      this.log.info(
        {
          messageId: message.messageId,
          conversationKey: message.conversationKey,
          kind: reply.kind,
        },
        'Feishu AI reply sent'
      )
    }
  }

  private async updateStreamingCard(cardId: string, content: string, sequence: number) {
    await this.client.cardkit.v1.cardElement.content({
      path: { card_id: cardId, element_id: 'stream_md' },
      data: { content, sequence, uuid: `c_${cardId}_${sequence}` },
    })
  }

  private async finishStreamingCard(cardId: string, sequence: number, summary: string) {
    await this.client.cardkit.v1.card.settings({
      path: { card_id: cardId },
      data: {
        settings: JSON.stringify({
          config: { streaming_mode: false, summary: { content: summary } },
        }),
        sequence,
        uuid: `s_${cardId}_${sequence}`,
      },
    })
  }

  private async transcribeAudioMessage(messageId: string, rawContent: string) {
    const content = parseMessageContent(rawContent)
    const platformTranscript = readAudioTranscript(content)
    if (platformTranscript) return platformTranscript
    const fileKey = typeof content.file_key === 'string' ? content.file_key.trim() : ''
    if (!fileKey) throw new Error('Feishu audio message has no file_key')

    const resource = await this.client.im.v1.messageResource.get({
      params: { type: 'audio' },
      path: { message_id: messageId, file_key: fileKey },
    })
    const directory = await mkdtemp(join(tmpdir(), 'api-starter-feishu-audio-'))
    const fileName = 'feishu-audio.ogg'
    const filePath = join(directory, fileName)
    try {
      await resource.writeFile(filePath)
      return await transcribeAudio(filePath, fileName, getAudioMimeType(fileName))
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }

  private async handleCardAction(event: FeishuCardActionEvent) {
    const value = event.action?.value
    if (!value || typeof value !== 'object') return
    const action = value as Record<string, unknown>
    const actionKey = typeof action.actionKey === 'string' ? action.actionKey : null
    const taskId = typeof action.taskId === 'string' ? action.taskId : null
    const externalUserId = event.operator?.open_id
    const conversationKey = event.context?.open_chat_id ?? event.open_chat_id
    if (!actionKey || !taskId || !externalUserId || !conversationKey) return

    const reply = await this.options.onTemplateCardEvent?.({
      channel: this.channel,
      externalTenantId: event.tenant_key ?? this.tenantId,
      externalUserId,
      conversationKey,
      actionKey,
      taskId,
      raw: event,
    })
    if (reply) {
      await this.send(
        {
          channel: this.channel,
          externalTenantId: event.tenant_key ?? this.tenantId,
          conversationKey,
        },
        reply
      )
    }
  }

  private toInteractiveCard(message: Extract<OutboundMessage, { kind: 'confirmation' }>) {
    return {
      schema: '2.0',
      header: { title: { tag: 'plain_text', content: message.title }, template: 'blue' },
      body: {
        elements: [
          { tag: 'markdown', content: formatConfirmationDetails(message) },
          {
            tag: 'column_set',
            flex_mode: 'none',
            columns: [
              {
                tag: 'column',
                width: 'weighted',
                elements: [
                  {
                    tag: 'button',
                    text: { tag: 'plain_text', content: message.confirmLabel },
                    type: 'primary',
                    value: {
                      actionKey: `confirm:${message.confirmationId}`,
                      taskId: message.confirmationId,
                    },
                  },
                ],
              },
              {
                tag: 'column',
                width: 'weighted',
                elements: [
                  {
                    tag: 'button',
                    text: { tag: 'plain_text', content: message.cancelLabel },
                    type: 'default',
                    value: {
                      actionKey: `cancel:${message.confirmationId}`,
                      taskId: message.confirmationId,
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    }
  }

  private toMarkdownCard(content: string) {
    return {
      schema: '2.0',
      body: {
        elements: [{ tag: 'markdown', content }],
      },
    }
  }

  private containsMarkdown(content: string) {
    return /(^|\n)\s{0,3}(?:#{1,6}\s|[-*+]\s|\d+\.\s)|```|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\[[^\]]+\]\([^\)]+\)/m.test(
      content
    )
  }

  private markMessageHandled(messageId: string) {
    const now = Date.now()
    for (const [id, expiresAt] of this.handledMessageIds) {
      if (expiresAt <= now) this.handledMessageIds.delete(id)
    }
    if (this.handledMessageIds.has(messageId)) return false
    this.handledMessageIds.set(messageId, now + 10 * 60 * 1000)
    return true
  }

  private logError(error: unknown, context: Record<string, unknown>) {
    this.log.error(
      { errorDetails: getSafeFeishuErrorDetails(error), ...context },
      'Feishu bot event handler failed'
    )
  }
}
