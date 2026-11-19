import { createHash } from 'node:crypto'

import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'

import {
  cancelAiChatConfirmationAndUpdateMessage,
  executeAiChatConfirmationAndCreateMessage,
} from '#ai/chat/confirmation/ai_chat_confirmation_service'
import { runAiChatAssistantTurn } from '#ai/chat/turn/ai_chat_turn_service'
import {
  AiAgentConfirmationError,
  listConversationConfirmations,
  listPendingConversationConfirmations,
} from '#ai/core/ai_agent_confirmation'
import type {
  ChannelAdapter,
  ChannelCardActionEvent,
  NormalizedInboundMessage,
  OutboundMessage,
} from '#channels/channel_types'
import type { ReloadableBotRuntime } from '#channels/reloadable_ai_channel_runtime'
import AiChatMessage from '#models/ai_chat_message'
import User from '#models/user'
import {
  getAiChatImageValidationMessage,
  validateAiChatImage,
} from '#services/ai_chat_image_service'
import { createChannelBindingChallenge } from '#services/channel_binding_service'
import {
  createVisitorConversationKey,
  findChannelConversation,
  findOrCreateChannelConversation,
  startNewChannelConversation,
  updateChannelConversationTitle,
} from '#services/channel_conversation_service'
import { getChannelGuestUser } from '#services/channel_guest_principal'
import { findActiveChannelIdentity } from '#services/channel_identity_service'

function createChannelHttpContext(user: User, channel: NormalizedInboundMessage['channel']) {
  return {
    auth: { getUserOrFail: () => user },
    auditChannel: channel,
    request: {
      ip: () => 'channel:external',
      header: () => undefined,
    },
  } as unknown as HttpContext
}

function summarizeConfirmation(confirmation: object | null) {
  if (!confirmation) return null
  const value = confirmation as Record<string, unknown>
  return {
    id: value.id ?? value.confirmationId ?? null,
    actionCode: value.actionCode ?? value.action ?? null,
    status: value.status ?? null,
    keys: Object.keys(value),
  }
}

function textReply(content: string): OutboundMessage {
  return { kind: 'text', content }
}

function removeConfirmationPlaceholder(content: string) {
  return content
    .replace(/\[确认卡片\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function getAssistantContentFromDoneEvent(data: Record<string, unknown>) {
  const message = data.message
  if (!message || typeof message !== 'object') return null
  const content = (message as Record<string, unknown>).content
  return typeof content === 'string' ? content : null
}

export function createAiChannelCandidateBuffer() {
  let callId: string | undefined
  let content = ''

  return {
    append(nextCallId: string, delta: string) {
      if (callId !== nextCallId) {
        callId = nextCallId
        content = ''
      }
      content += delta
      return content
    },
    clear(targetCallId: string) {
      if (callId !== targetCallId) return false
      callId = undefined
      content = ''
      return true
    },
    commit(targetCallId: string) {
      if (callId !== targetCallId) return null
      const committed = content
      callId = undefined
      content = ''
      return committed
    },
  }
}

function confirmationReply(confirmation: object): OutboundMessage | null {
  const value = confirmation as Record<string, unknown>
  const nestedConfirmation = value.confirmation
  const candidate =
    nestedConfirmation && typeof nestedConfirmation === 'object'
      ? (nestedConfirmation as Record<string, unknown>)
      : value
  const presentation = candidate.presentation
  if (!presentation || typeof presentation !== 'object') return null
  const card = presentation as Record<string, unknown>
  if (
    typeof card.title !== 'string' ||
    typeof card.summary !== 'string' ||
    typeof card.approveLabel !== 'string' ||
    typeof card.cancelLabel !== 'string'
  ) {
    return null
  }

  const changes = Array.isArray(card.changes)
    ? card.changes.flatMap((changeValue) => {
        if (!changeValue || typeof changeValue !== 'object') return []
        const change = changeValue as Record<string, unknown>
        if (typeof change.label !== 'string' || typeof change.value !== 'string') return []
        return [{ label: change.label, value: change.value }]
      })
    : []

  return {
    kind: 'confirmation',
    title: card.title,
    description: card.summary,
    confirmationId: String(candidate.id),
    confirmLabel: card.approveLabel,
    cancelLabel: card.cancelLabel,
    ...(typeof card.targetLabel === 'string' ? { targetLabel: card.targetLabel } : {}),
    ...(changes.length ? { changes } : {}),
    ...(typeof card.impactLabel === 'string' ? { impactLabel: card.impactLabel } : {}),
  }
}

export class AiChannelBridge implements ReloadableBotRuntime {
  readonly configurationKey?: string
  private readonly botId: string
  private readonly legacyIdentity: boolean

  constructor(
    adapter: ChannelAdapter,
    configurationKey?: string,
    botId = 'legacy',
    legacyIdentity = true
  ) {
    this.adapter = adapter
    this.configurationKey = configurationKey
    this.botId = botId
    this.legacyIdentity = legacyIdentity
  }

  private readonly adapter: ChannelAdapter

  private scopeConversationKey(key: string) {
    if (this.legacyIdentity) return key
    const digest = createHash('sha256').update(`${this.botId}\u0000${key}`).digest('hex')
    return `bot:${digest}`
  }

  async handleMessage(
    message: NormalizedInboundMessage,
    emit?: (content: string) => Promise<void>
  ): Promise<OutboundMessage> {
    const log = logger.child({ channel: message.channel })
    let imageMimeType: string | undefined
    const isVisitor = message.conversationType === 'group'
    let user: User
    let conversationKey = this.scopeConversationKey(message.conversationKey)
    if (isVisitor) {
      try {
        user = await getChannelGuestUser()
      } catch (error) {
        log.error(
          {
            err: error,
            messageId: message.messageId,
            conversationKey: message.conversationKey,
          },
          'Channel visitor principal lookup failed'
        )
        return textReply('群聊访客模式尚未初始化，请联系管理员。')
      }
      conversationKey = createVisitorConversationKey({
        externalConversationKey: this.scopeConversationKey(message.conversationKey),
        externalUserId: message.externalUserId,
      })
    } else {
      const identity = await findActiveChannelIdentity({
        channel: message.channel,
        externalTenantId: message.externalTenantId,
        externalUserId: message.externalUserId,
      })
      if (!identity) {
        const challenge = await createChannelBindingChallenge({
          channel: message.channel,
          externalTenantId: message.externalTenantId,
          externalUserId: message.externalUserId,
        })
        if (challenge) {
          return textReply(
            `当前账号尚未绑定系统用户。请登录管理后台，在“账号设置”中输入一次性绑定码：${challenge.code}（10分钟内有效）。`
          )
        }
        return textReply('当前账号尚未绑定系统用户，请使用之前收到的绑定码完成绑定。')
      }

      const activeUser = await User.query()
        .where('id', identity.userId)
        .whereNull('disabled_at')
        .first()
      if (!activeUser) return textReply('当前系统账号不可用，请联系管理员。')
      user = activeUser
    }

    if (message.imageData) {
      try {
        imageMimeType = validateAiChatImage(message.imageData)
      } catch (error) {
        return textReply(getAiChatImageValidationMessage(error) ?? '图片处理失败，请稍后重试。')
      }
    } else if (message.messageType === 'image') {
      return textReply('未能读取图片，请重新发送。')
    }

    if (!message.imageData && message.content.trim().toLowerCase() === '/new') {
      await startNewChannelConversation({
        channel: message.channel,
        externalTenantId: message.externalTenantId,
        externalConversationKey: conversationKey,
        userId: user.id,
      })
      log.info(
        {
          messageId: message.messageId,
          conversationKey: message.conversationKey,
          userId: user.id,
        },
        'Channel conversation reset by /new command'
      )
      return textReply('已新建会话，之前的对话上下文不会继续影响当前会话。')
    }

    const conversation = await findOrCreateChannelConversation({
      channel: message.channel,
      externalTenantId: message.externalTenantId,
      externalConversationKey: conversationKey,
      userId: user.id,
    })
    const userMessage = await AiChatMessage.create({
      conversationId: conversation.id,
      role: 'user',
      content: message.content,
      ...(message.imageData && imageMimeType
        ? { imageData: message.imageData, imageMimeType }
        : {}),
    })
    await updateChannelConversationTitle({ conversation, channel: message.channel })

    let assistantContent = ''
    let streamedContent = ''
    const candidateBuffer = createAiChannelCandidateBuffer()
    let confirmation: object | null = null
    let managedActionResult: 'pending' | 'error' | null = null
    const publishStreamContent = async (content: string) => {
      const visibleContent = removeConfirmationPlaceholder(content)
      if (!emit || !visibleContent || visibleContent === streamedContent) return
      streamedContent = visibleContent
      await emit(visibleContent)
    }
    try {
      await runAiChatAssistantTurn({
        conversation,
        userId: user.id,
        userMessage,
        regeneration: null,
        capabilityMode: isVisitor ? 'knowledge-only' : 'channel',
        signal: new AbortController().signal,
        ctx: createChannelHttpContext(user, message.channel),
        onEvent: async ({ event, data }) => {
          if (
            event === 'agent_candidate_delta' &&
            typeof data.callId === 'string' &&
            typeof data.content === 'string'
          ) {
            const candidate = candidateBuffer.append(data.callId, data.content)
            await publishStreamContent(`${assistantContent}${candidate}`)
          }
          if (event === 'agent_candidate_clear' && typeof data.callId === 'string') {
            if (candidateBuffer.clear(data.callId)) {
              await publishStreamContent(assistantContent || '正在输入……')
            }
          }
          if (event === 'agent_candidate_commit' && typeof data.callId === 'string') {
            const candidate = candidateBuffer.commit(data.callId)
            if (candidate !== null) {
              assistantContent += candidate
              await publishStreamContent(assistantContent)
            }
          }
          if (event === 'delta') {
            assistantContent += data.content
            await publishStreamContent(assistantContent)
          }
          if (event === 'done') {
            const finalContent = getAssistantContentFromDoneEvent(data)
            if (finalContent !== null) {
              assistantContent = finalContent
              await publishStreamContent(finalContent)
            }
            log.info(
              {
                messageId: message.messageId,
                conversationKey: message.conversationKey,
                conversationId: conversation.id,
                confirmationCount: data.confirmations.length,
              },
              'Channel AI turn completed'
            )
            if (data.confirmations[0]) confirmation = data.confirmations[0]
          }
          if (event === 'agent_confirmation') {
            managedActionResult = 'pending'
            confirmation = data
            await publishStreamContent('等待确认操作…')
            log.info(
              {
                messageId: message.messageId,
                conversationKey: message.conversationKey,
                conversationId: conversation.id,
                confirmation: summarizeConfirmation(confirmation),
              },
              'Channel agent confirmation event received'
            )
          }
          if (event === 'tool_completed') {
            const output = data.output
            if (output && typeof output === 'object') {
              const artifact = output as Record<string, unknown>
              log.info(
                {
                  messageId: message.messageId,
                  conversationKey: message.conversationKey,
                  conversationId: conversation.id,
                  artifactKind: artifact.kind ?? null,
                },
                'Channel AI tool completed'
              )
              if (artifact.kind === 'action_error') {
                managedActionResult = 'error'
              }
            }
          }
        },
      })
    } catch (error) {
      log.error(
        {
          err: error,
          messageId: message.messageId,
          conversationId: conversation.id,
        },
        'Channel AI turn failed'
      )
      return textReply('本次 AI 请求未完成，请稍后重试。')
    }

    if (!confirmation) {
      const persistedConfirmations = await listConversationConfirmations(conversation.id, user.id)
      if (persistedConfirmations[0]) confirmation = persistedConfirmations[0]
    }
    if (!confirmation) {
      const pendingConfirmations = await listPendingConversationConfirmations(
        conversation.id,
        user.id
      )
      if (pendingConfirmations[0]) confirmation = pendingConfirmations[0]
    }
    log.info(
      {
        messageId: message.messageId,
        conversationKey: message.conversationKey,
        conversationId: conversation.id,
        managedActionResult,
        confirmation: summarizeConfirmation(confirmation),
      },
      'Channel confirmation resolution completed'
    )
    if (confirmation) {
      const reply = confirmationReply(confirmation)
      if (reply) return reply
      log.warn(
        {
          messageId: message.messageId,
          conversationKey: message.conversationKey,
          conversationId: conversation.id,
          confirmation: summarizeConfirmation(confirmation),
        },
        'Channel confirmation was found but could not be converted to a card'
      )
    }
    if (managedActionResult === 'pending') {
      log.warn(
        {
          messageId: message.messageId,
          conversationKey: message.conversationKey,
          conversationId: conversation.id,
        },
        'Channel managed action completed without a serializable confirmation'
      )
      return textReply('操作提案已生成，但确认卡未发送成功，请重新发起操作。')
    }
    if (managedActionResult === 'error') {
      return textReply('操作未完成，请检查权限或参数后重试。')
    }
    return textReply(removeConfirmationPlaceholder(assistantContent) || 'AI 没有生成可显示的回复。')
  }

  async handleMessageStream(
    message: NormalizedInboundMessage,
    emit: (content: string) => Promise<void>
  ) {
    return this.handleMessage(message, emit)
  }

  async start() {
    await this.adapter.start()
  }

  async handleTemplateCardEvent(input: ChannelCardActionEvent): Promise<OutboundMessage> {
    let guestUser: User
    try {
      guestUser = await getChannelGuestUser()
    } catch (error) {
      logger.error(
        { err: error, channel: input.channel, conversationKey: input.conversationKey },
        'Channel guest principal lookup failed while resolving card action'
      )
      return textReply('确认操作暂时不可用，请稍后重试或联系管理员。')
    }

    const visitorConversation = await findChannelConversation({
      channel: input.channel,
      externalTenantId: input.externalTenantId,
      externalConversationKey: createVisitorConversationKey({
        externalConversationKey: this.scopeConversationKey(input.conversationKey),
        externalUserId: input.externalUserId,
      }),
      userId: guestUser.id,
    })
    if (visitorConversation) {
      return textReply('群聊访客模式不支持确认操作，请转到私聊并完成身份绑定。')
    }

    let identity = await findActiveChannelIdentity({
      channel: input.channel,
      externalTenantId: input.externalTenantId,
      externalUserId: input.externalUserId,
    })
    if (!identity) return textReply('当前账号尚未绑定系统用户。')
    const user = await User.query().where('id', identity.userId).whereNull('disabled_at').first()
    if (!user) return textReply('当前系统账号不可用，请联系管理员。')
    let conversation = await findChannelConversation({
      channel: input.channel,
      externalTenantId: input.externalTenantId,
      externalConversationKey: this.scopeConversationKey(input.conversationKey),
      userId: user.id,
    })
    if (!conversation) return textReply('找不到对应的 AI 会话，请重新发起请求。')

    const confirmationId = Number(input.taskId)
    if (!Number.isSafeInteger(confirmationId) || confirmationId <= 0) {
      return textReply('确认请求编号无效。')
    }
    const ctx = createChannelHttpContext(user, input.channel)
    try {
      if (input.actionKey === `confirm:${input.taskId}`) {
        const result = await executeAiChatConfirmationAndCreateMessage({
          ctx,
          conversation,
          confirmationId,
          userId: user.id,
        })
        if (result.isToolAction && result.pendingConfirmations.length > 0) {
          return textReply('操作已执行；这组确认仍有待处理项，处理完后我会统一总结。')
        }
        return textReply(result.reply)
      }
      if (input.actionKey === `cancel:${input.taskId}`) {
        const result = await cancelAiChatConfirmationAndUpdateMessage({
          ctx,
          conversation,
          confirmationId,
          userId: user.id,
          source: 'channel',
        })
        return textReply(result.reply)
      }
      return textReply('未知的确认操作。')
    } catch (error) {
      return textReply(
        error instanceof AiAgentConfirmationError ? error.message : '确认操作未完成，请稍后重试。'
      )
    }
  }

  async stop() {
    await this.adapter.stop()
  }
}
