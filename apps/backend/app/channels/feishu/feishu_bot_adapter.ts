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
import { getAudioMimeType, transcribeAudio } from '#services/ai_speech_service'

export interface FeishuBotAdapterOptions {
  appId: string
  secret: string
  tenantId?: string
  domain?: string
  onMessage: (message: NormalizedInboundMessage) => Promise<OutboundMessage | void>
  onTemplateCardEvent?: (input: ChannelCardActionEvent) => Promise<OutboundMessage | void>
}

type FeishuMessageEvent = Parameters<
  NonNullable<Parameters<Lark.EventDispatcher['register']>[0]['im.message.receive_v1']>
>[0]

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

function summarizeContent(content: string) {
  const normalized = content.replace(/\s+/g, ' ').trim()
  return normalized.length > 240 ? `${normalized.slice(0, 240)}…` : normalized
}

export class FeishuBotAdapter implements ChannelAdapter {
  readonly channel = 'feishu' as const
  readonly tenantId: string
  private readonly client: Lark.Client
  private readonly wsClient: Lark.WSClient
  private started = false
  private readonly handledMessageIds = new Map<string, number>()

  constructor(private readonly options: FeishuBotAdapterOptions) {
    this.tenantId = options.tenantId ?? 'feishu'
    const baseConfig = {
      appId: options.appId,
      appSecret: options.secret,
      domain: options.domain,
    }
    this.client = new Lark.Client(baseConfig)
    this.wsClient = new Lark.WSClient({
      ...baseConfig,
      loggerLevel: Lark.LoggerLevel.info,
      autoReconnect: true,
      onReady: () => console.info('[feishu-bot] WebSocket authenticated'),
      onReconnecting: () => console.warn('[feishu-bot] WebSocket reconnecting'),
    })
  }

  async start() {
    if (this.started) return
    this.started = true
    const eventDispatcher = new Lark.EventDispatcher({
      loggerLevel: Lark.LoggerLevel.info,
    }).register({
      'im.message.receive_v1': async (event: FeishuMessageEvent) => {
        logger.info(
          {
            messageId: event.message.message_id,
            chatId: event.message.chat_id,
            messageType: event.message.message_type,
            senderType: event.sender.sender_type,
          },
          'Feishu message event received'
        )
        if (!this.markMessageHandled(event.message.message_id)) {
          logger.debug({ messageId: event.message.message_id }, 'Feishu message event deduplicated')
          return
        }
        void this.handleMessage(event).catch((error) => this.logError(error))
      },
      'card.action.trigger': async (event: FeishuCardActionEvent) => {
        void this.handleCardAction(event).catch((error) => this.logError(error))
      },
    })
    await this.wsClient.start({ eventDispatcher })
  }

  async stop() {
    if (!this.started) return
    this.started = false
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
      logger.warn({ messageId: event.message.message_id }, 'Feishu message has no sender open_id')
      return
    }

    const isAudio = event.message.message_type === 'audio'
    let content = isAudio ? '' : parseTextContent(event.message.content)
    if (isAudio) {
      try {
        content = await this.transcribeAudioMessage(event.message.message_id, event.message.content)
      } catch (error) {
        logger.error(
          { messageId: event.message.message_id, err: error },
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
    logger.info(
      {
        messageId: message.messageId,
        conversationKey: message.conversationKey,
        externalUserId: message.externalUserId,
        contentLength: message.content.length,
        contentPreview: summarizeContent(message.content),
      },
      'Feishu message normalized; handing off to AI bridge'
    )
    const reply = await this.options.onMessage(message)
    if (reply) {
      await this.send(
        {
          channel: this.channel,
          externalTenantId: message.externalTenantId,
          conversationKey: message.conversationKey,
        },
        reply
      )
      logger.info({ messageId: message.messageId, kind: reply.kind }, 'Feishu AI reply sent')
    }
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
          { tag: 'markdown', content: message.description },
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

  private logError(error: unknown) {
    logger.error(
      { err: error instanceof Error ? error : undefined },
      'Feishu bot event handler failed'
    )
  }
}
