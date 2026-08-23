import crypto from 'node:crypto'

import logger from '@adonisjs/core/services/logger'
import type { DWClientDownStream, RobotMessage } from 'dingtalk-stream'
import { DWClient, EventAck, TOPIC_CARD, TOPIC_ROBOT } from 'dingtalk-stream'

import type {
  ChannelAdapter,
  ChannelCardActionEvent,
  ChannelTarget,
  NormalizedInboundMessage,
  OutboundMessage,
} from '#channels/channel_types'

export interface DingTalkBotAdapterOptions {
  clientId: string
  clientSecret: string
  cardTemplateId?: string | null
  streamingCardTemplateId?: string | null
  onMessage: (message: NormalizedInboundMessage) => Promise<OutboundMessage | void>
  onMessageStream?: (
    message: NormalizedInboundMessage,
    emit: (content: string) => Promise<void>
  ) => Promise<OutboundMessage | void>
  onTemplateCardEvent?: (input: ChannelCardActionEvent) => Promise<OutboundMessage | void>
}

interface CachedConversation {
  message: RobotMessage
  externalTenantId: string
  expiresAt: number
}

function parseJson(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function compact(value: string) {
  const content = value.replace(/\s+/g, ' ').trim()
  return content.length > 240 ? `${content.slice(0, 240)}…` : content
}

function normalizeSessionWebhookExpiry(value: unknown) {
  const timestamp = Number(value)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return Date.now() + 60 * 60 * 1000
  return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp
}

async function readDingTalkResponse(response: Response) {
  const raw = await response.text()
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return { message: raw.slice(0, 500) }
  }
}

function formatDingTalkError(status: number, result: Record<string, unknown>) {
  const code = result.code ?? result.errcode ?? result.errorCode ?? 'unknown'
  const message = result.message ?? result.msg ?? result.errorMsg ?? 'unknown error'
  return `DingTalk card request failed: status=${status}, code=${String(code)}, message=${String(message).slice(0, 300)}`
}

export class DingTalkBotAdapter implements ChannelAdapter {
  readonly channel = 'dingtalk' as const
  readonly tenantId = 'dingtalk'
  private readonly client: DWClient
  private readonly conversations = new Map<string, CachedConversation>()
  private started = false

  constructor(private readonly options: DingTalkBotAdapterOptions) {
    this.client = new DWClient({
      clientId: options.clientId,
      clientSecret: options.clientSecret,
      debug: false,
      keepAlive: true,
    })
  }

  async start() {
    if (this.started) return
    this.started = true
    this.client
      .registerCallbackListener(TOPIC_ROBOT, (event) => {
        void this.handleRobotEvent(event).catch((error) => this.logError(error))
      })
      .registerCallbackListener(TOPIC_CARD, (event) => {
        void this.handleCardEvent(event).catch((error) => this.logError(error))
      })
    await this.client.connect()
    logger.info('DingTalk AI bot WebSocket worker started')
  }

  async stop() {
    if (!this.started) return
    this.started = false
    this.client.disconnect()
    this.conversations.clear()
  }

  async send(target: ChannelTarget, message: OutboundMessage) {
    if (target.channel !== this.channel) {
      throw new Error(`Unsupported channel target: ${target.channel}`)
    }
    const cached = this.conversations.get(target.conversationKey)
    if (!cached || cached.expiresAt <= Date.now()) {
      this.conversations.delete(target.conversationKey)
      throw new Error('DingTalk session webhook is unavailable or expired')
    }

    if (message.kind === 'confirmation') {
      try {
        await this.deliverConfirmationCard(cached.message, target.externalTenantId, message)
      } catch (error) {
        this.logError(error)
        await this.postSessionWebhook(cached.message.sessionWebhook, {
          msgtype: 'text',
          text: { content: '受控操作确认卡发送失败，本次操作未执行，请稍后重试或联系管理员。' },
        })
      }
      return
    }
    await this.postSessionWebhook(cached.message.sessionWebhook, {
      msgtype: 'markdown',
      markdown: { title: 'AI 助手', text: message.content },
    })
  }

  private async handleRobotEvent(event: DWClientDownStream) {
    const message = parseJson(event.data) as unknown as RobotMessage
    this.client.socketCallBackResponse(event.headers.messageId, EventAck.SUCCESS)
    if (message.msgtype !== 'text' || !message.text?.content) {
      logger.info({ messageId: message.msgId }, 'DingTalk non-text message ignored')
      return
    }
    const externalUserId = message.senderStaffId || message.senderId
    const conversationKey = message.conversationId || externalUserId
    if (!externalUserId || !conversationKey || !message.sessionWebhook) {
      logger.warn({ messageId: message.msgId }, 'DingTalk message lacks routing identity')
      return
    }
    this.conversations.set(conversationKey, {
      message,
      externalTenantId:
        event.headers.eventCorpId || message.chatbotCorpId || message.senderCorpId || this.tenantId,
      expiresAt: normalizeSessionWebhookExpiry(message.sessionWebhookExpiredTime),
    })
    const normalized: NormalizedInboundMessage = {
      channel: this.channel,
      externalTenantId:
        event.headers.eventCorpId || message.chatbotCorpId || message.senderCorpId || this.tenantId,
      externalUserId,
      conversationKey,
      messageId: message.msgId,
      messageType: 'text',
      content: message.text.content.trim(),
      receivedAt: new Date(message.createAt || Date.now()),
      raw: message,
    }
    logger.info(
      {
        messageId: normalized.messageId,
        conversationKey,
        externalUserId,
        contentLength: normalized.content.length,
        contentPreview: compact(normalized.content),
      },
      'DingTalk message normalized; handing off to AI bridge'
    )
    const reply =
      this.options.onMessageStream && this.options.streamingCardTemplateId
        ? await this.handleStreamingReply(message, normalized)
        : await this.options.onMessage(normalized)
    if (reply) {
      await this.send(
        { channel: this.channel, externalTenantId: normalized.externalTenantId, conversationKey },
        reply
      )
      logger.info({ messageId: normalized.messageId, kind: reply.kind }, 'DingTalk AI reply sent')
    }
  }

  private async handleStreamingReply(message: RobotMessage, normalized: NormalizedInboundMessage) {
    let latestContent = '正在输入……'
    let outTrackId: string
    try {
      outTrackId = await this.createStreamingCard(message, latestContent)
    } catch (error) {
      this.logError(error)
      logger.warn(
        { conversationKey: normalized.conversationKey },
        'DingTalk streaming card creation failed; falling back to text reply'
      )
      return this.options.onMessage(normalized)
    }

    let streamingCardFailed = false
    let lastUpdatedAt = 0
    const reply = await this.options.onMessageStream!(normalized, async (content) => {
      latestContent = content || latestContent
      const elapsed = Date.now() - lastUpdatedAt
      if (elapsed < 250) await new Promise((resolve) => setTimeout(resolve, 250 - elapsed))
      if (streamingCardFailed) return
      try {
        await this.updateStreamingCard(outTrackId, latestContent)
        lastUpdatedAt = Date.now()
      } catch (error) {
        streamingCardFailed = true
        this.logError(error)
        logger.warn(
          { conversationKey: normalized.conversationKey },
          'DingTalk streaming card update failed; final reply will use text'
        )
      }
    })
    const finalContent = reply?.kind === 'text' ? reply.content : latestContent
    if (!streamingCardFailed) {
      try {
        await this.updateStreamingCard(outTrackId, finalContent)
        logger.info({ outTrackId }, 'DingTalk streaming card completed')
      } catch (error) {
        streamingCardFailed = true
        this.logError(error)
        logger.warn(
          { conversationKey: normalized.conversationKey },
          'DingTalk final streaming card update failed; falling back to text reply'
        )
      }
    }
    if (!streamingCardFailed && reply?.kind !== 'confirmation') return
    return reply
  }

  private async handleCardEvent(event: DWClientDownStream) {
    const body = parseJson(event.data)
    const content = typeof body.content === 'string' ? parseJson(body.content) : body
    const privateData = this.asRecord(content.cardPrivateData)
    const params = this.asRecord(privateData.params)
    const actionKey = this.readString(params.actionKey) ?? this.readString(content.actionKey)
    const taskId = this.readString(params.taskId) ?? this.readString(content.taskId)
    const conversationKey =
      this.readString(params.conversationKey) ??
      this.readString(body.conversationId) ??
      this.readString(body.openSpaceId)?.split('.').pop()
    const externalUserId =
      this.readString(params.externalUserId) ??
      this.readString(body.senderStaffId) ??
      this.readString(body.userId)
    const externalTenantId =
      this.readString(params.externalTenantId) ??
      this.readString(event.headers.eventCorpId) ??
      this.tenantId
    if (!actionKey || !taskId || !conversationKey || !externalUserId) {
      this.client.socketCallBackResponse(event.headers.messageId, EventAck.SUCCESS)
      logger.warn(
        { messageId: event.headers.messageId },
        'DingTalk card callback lacks action context'
      )
      return
    }
    this.client.socketCallBackResponse(event.headers.messageId, {
      cardUpdateOptions: { updateCardDataByKey: true, updatePrivateDataByKey: true },
      userPrivateData: { cardParamMap: { actionKey, taskId } },
    })
    const reply = await this.options.onTemplateCardEvent?.({
      channel: this.channel,
      externalTenantId,
      externalUserId,
      conversationKey,
      actionKey,
      taskId,
      raw: body,
    })
    if (reply) {
      await this.send(
        {
          channel: this.channel,
          externalTenantId,
          conversationKey,
        },
        reply
      )
    }
  }

  private async deliverConfirmationCard(
    message: RobotMessage,
    externalTenantId: string,
    confirmation: Extract<OutboundMessage, { kind: 'confirmation' }>
  ) {
    const cardTemplateId = this.options.cardTemplateId?.trim()
    if (!cardTemplateId) {
      await this.postSessionWebhook(message.sessionWebhook, {
        msgtype: 'text',
        text: { content: '受控操作确认卡未配置，请管理员在 LLM 配置中填写钉钉互动卡片模板 ID。' },
      })
      logger.warn(
        { confirmationId: confirmation.confirmationId },
        'DingTalk confirmation card template is missing'
      )
      return
    }
    const accessToken = await this.client.getAccessToken()
    if (!accessToken) throw new Error('Unable to obtain DingTalk access token')
    const outTrackId = `ai-${confirmation.confirmationId}-${crypto.randomUUID()}`
    const cardData = {
      description: confirmation.description,
      confirmLabel: confirmation.confirmLabel,
      cancelLabel: confirmation.cancelLabel,
      confirmActionKey: `confirm:${confirmation.confirmationId}`,
      cancelActionKey: `cancel:${confirmation.confirmationId}`,
      taskId: String(confirmation.confirmationId),
      conversationKey: String(message.conversationId),
      externalUserId: String(message.senderStaffId || message.senderId),
      externalTenantId,
    }
    const payload: Record<string, unknown> = {
      cardTemplateId,
      outTrackId,
      callbackType: 'STREAM',
      cardData: { cardParamMap: cardData },
      openSpaceId:
        message.conversationType === '2'
          ? `dtv1.card//IM_GROUP.${message.conversationId}`
          : `dtv1.card//IM_ROBOT.${message.senderStaffId}`,
    }
    if (message.conversationType === '2') {
      payload.imGroupOpenSpaceModel = { supportForward: true }
      payload.imGroupOpenDeliverModel = { robotCode: this.options.clientId }
    } else {
      payload.imRobotOpenSpaceModel = { supportForward: true }
      payload.imRobotOpenDeliverModel = { spaceType: 'IM_ROBOT' }
    }
    logger.info(
      {
        confirmationId: confirmation.confirmationId,
        cardTemplateId,
        conversationType: message.conversationType,
        openSpaceId: payload.openSpaceId,
        cardDataKeys: Object.keys(cardData),
      },
      'Sending DingTalk confirmation card'
    )
    const response = await fetch('https://api.dingtalk.com/v1.0/card/instances/createAndDeliver', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-acs-dingtalk-access-token': accessToken },
      body: JSON.stringify(payload),
    })
    const result = await readDingTalkResponse(response)
    if (!response.ok || result.success === false) {
      throw new Error(formatDingTalkError(response.status, result))
    }
    logger.info(
      { confirmationId: confirmation.confirmationId, outTrackId, response: result },
      'DingTalk confirmation card sent'
    )
  }

  private async createStreamingCard(message: RobotMessage, content: string) {
    const cardTemplateId = this.options.streamingCardTemplateId?.trim()
    if (!cardTemplateId) throw new Error('DingTalk streaming card template is missing')
    const accessToken = await this.client.getAccessToken()
    if (!accessToken) throw new Error('Unable to obtain DingTalk access token')
    const outTrackId = `ai-stream-${crypto.randomUUID()}`
    const payload: Record<string, unknown> = {
      cardTemplateId,
      outTrackId,
      callbackType: 'STREAM',
      cardData: { cardParamMap: { content } },
      openSpaceId:
        message.conversationType === '2'
          ? `dtv1.card//IM_GROUP.${message.conversationId}`
          : `dtv1.card//IM_ROBOT.${message.senderStaffId}`,
    }
    if (message.conversationType === '2') {
      payload.imGroupOpenSpaceModel = { supportForward: true }
      payload.imGroupOpenDeliverModel = { robotCode: this.options.clientId }
    } else {
      payload.imRobotOpenSpaceModel = { supportForward: true }
      payload.imRobotOpenDeliverModel = { spaceType: 'IM_ROBOT' }
    }
    const response = await fetch('https://api.dingtalk.com/v1.0/card/instances/createAndDeliver', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-acs-dingtalk-access-token': accessToken },
      body: JSON.stringify(payload),
    })
    const result = await readDingTalkResponse(response)
    if (!response.ok || result.success === false) {
      throw new Error(formatDingTalkError(response.status, result))
    }
    logger.info({ outTrackId }, 'DingTalk streaming card created')
    return outTrackId
  }

  private async updateStreamingCard(outTrackId: string, content: string) {
    const accessToken = await this.client.getAccessToken()
    if (!accessToken) throw new Error('Unable to obtain DingTalk access token')
    const response = await fetch('https://api.dingtalk.com/v1.0/card/instances', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-acs-dingtalk-access-token': accessToken },
      body: JSON.stringify({
        outTrackId,
        cardData: { cardParamMap: { content } },
        cardUpdateOptions: { updateCardDataByKey: true },
      }),
    })
    if (!response.ok) {
      const result = await readDingTalkResponse(response)
      throw new Error(formatDingTalkError(response.status, result))
    }
    logger.debug({ outTrackId, status: response.status }, 'DingTalk streaming card updated')
  }

  private async postSessionWebhook(url: string, payload: Record<string, unknown>) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(`DingTalk session webhook failed: ${response.status}`)
  }

  private asRecord(value: unknown) {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  }

  private readString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }

  private logError(error: unknown) {
    logger.error({ err: error }, 'DingTalk bot callback failed')
  }
}
