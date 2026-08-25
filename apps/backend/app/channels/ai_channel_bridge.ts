import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'

import { runAiChatAssistantTurn } from '#ai/chat/ai_chat_turn_service'
import {
  AiAgentConfirmationError,
  cancelAiAgentAction,
  confirmAiAgentAction,
  getAiAgentActionResultMessage,
} from '#ai/core/ai_agent_confirmation'
import {
  listConversationConfirmations,
  listPendingConversationConfirmations,
} from '#ai/core/ai_agent_confirmation'
import type {
  ChannelAdapter,
  ChannelCardActionEvent,
  NormalizedInboundMessage,
  OutboundMessage,
} from '#channels/channel_types'
import AiChatMessage from '#models/ai_chat_message'
import User from '#models/user'
import { createChannelBindingChallenge } from '#services/channel_binding_service'
import {
  findChannelConversation,
  findOrCreateChannelConversation,
  startNewChannelConversation,
} from '#services/channel_conversation_service'
import { findActiveChannelIdentity } from '#services/channel_identity_service'

function createChannelHttpContext(user: User) {
  return {
    auth: { getUserOrFail: () => user },
    request: {
      ip: () => 'channel:external',
      header: () => undefined,
    },
  } as unknown as HttpContext
}

function summarizeConfirmation(confirmation: Record<string, unknown> | null) {
  if (!confirmation) return null
  return {
    id: confirmation.id ?? confirmation.confirmationId ?? null,
    actionCode: confirmation.actionCode ?? confirmation.action ?? null,
    status: confirmation.status ?? null,
    keys: Object.keys(confirmation),
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

function confirmationReply(value: Record<string, unknown>): OutboundMessage | null {
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

  return {
    kind: 'confirmation',
    title: card.title,
    description: card.summary,
    confirmationId: String(candidate.id),
    confirmLabel: card.approveLabel,
    cancelLabel: card.cancelLabel,
  }
}

export class AiChannelBridge {
  constructor(private readonly adapter: ChannelAdapter) {}

  async handleMessage(
    message: NormalizedInboundMessage,
    emit?: (content: string) => Promise<void>
  ): Promise<OutboundMessage> {
    let identity = await findActiveChannelIdentity({
      channel: message.channel,
      externalTenantId: message.externalTenantId,
      externalUserId: message.externalUserId,
    })
    if (!identity) {
      if (message.conversationType === 'group') {
        return textReply('当前群聊不支持绑定。请先在与机器人的单聊中获取绑定码并完成绑定。')
      }
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

    const user = await User.query().where('id', identity.userId).whereNull('disabled_at').first()
    if (!user) return textReply('当前系统账号不可用，请联系管理员。')

    if (message.content.trim().toLowerCase() === '/new') {
      await startNewChannelConversation({
        channel: message.channel,
        externalTenantId: message.externalTenantId,
        externalConversationKey: message.conversationKey,
        userId: user.id,
      })
      logger.info(
        {
          channel: message.channel,
          externalConversationKey: message.conversationKey,
          userId: user.id,
        },
        'Channel conversation reset by /new command'
      )
      return textReply('已新建会话，之前的对话上下文不会继续影响当前会话。')
    }

    const conversation = await findOrCreateChannelConversation({
      channel: message.channel,
      externalTenantId: message.externalTenantId,
      externalConversationKey: message.conversationKey,
      userId: user.id,
    })
    const userMessage = await AiChatMessage.create({
      conversationId: conversation.id,
      role: 'user',
      content: message.content,
    })

    let assistantContent = ''
    let confirmation: Record<string, unknown> | null = null
    let managedActionResult: 'pending' | 'error' | null = null
    try {
      await runAiChatAssistantTurn({
        conversation,
        userId: user.id,
        userMessage,
        regeneration: null,
        signal: new AbortController().signal,
        ctx: createChannelHttpContext(user),
        onEvent: async (event, data) => {
          if (event === 'delta' && data && typeof data === 'object') {
            const content = (data as Record<string, unknown>).content
            if (typeof content === 'string') {
              assistantContent += content
              if (emit) await emit(removeConfirmationPlaceholder(assistantContent))
            }
          }
          if (event === 'done' && data && typeof data === 'object') {
            const confirmations = (data as Record<string, unknown>).confirmations
            logger.info(
              {
                conversationId: conversation.id,
                confirmationCount: Array.isArray(confirmations) ? confirmations.length : 0,
              },
              `${message.channel} AI turn completed`
            )
            if (Array.isArray(confirmations) && confirmations[0]) {
              confirmation = confirmations[0] as Record<string, unknown>
            }
          }
          if (event === 'agent_confirmation' && data && typeof data === 'object') {
            managedActionResult = 'pending'
            confirmation = data as Record<string, unknown>
            logger.info(
              {
                conversationId: conversation.id,
                confirmation: summarizeConfirmation(confirmation),
              },
              `${message.channel} agent confirmation event received`
            )
          }
          if (event === 'tool_completed' && data && typeof data === 'object') {
            const output = (data as Record<string, unknown>).output
            if (output && typeof output === 'object') {
              const artifact = output as Record<string, unknown>
              logger.info(
                {
                  conversationId: conversation.id,
                  artifactKind: artifact.kind ?? null,
                  hasConfirmation: Boolean(artifact.confirmation),
                },
                `${message.channel} AI tool completed`
              )
              if (artifact.kind === 'confirmation' && artifact.confirmation) {
                managedActionResult = 'pending'
                confirmation = artifact.confirmation as Record<string, unknown>
              } else if (artifact.kind === 'action_error') {
                managedActionResult = 'error'
              }
            }
          }
        },
      })
    } catch {
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
    logger.info(
      {
        conversationId: conversation.id,
        managedActionResult,
        confirmation: summarizeConfirmation(confirmation),
      },
      `${message.channel} confirmation resolution completed`
    )
    if (confirmation) {
      const reply = confirmationReply(confirmation)
      if (reply) return reply
      logger.warn(
        { conversationId: conversation.id, confirmation: summarizeConfirmation(confirmation) },
        `${message.channel} confirmation was found but could not be converted to a card`
      )
    }
    if (managedActionResult === 'pending') {
      logger.warn(
        { conversationId: conversation.id },
        `${message.channel} managed action completed without a serializable confirmation`
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
      externalConversationKey: input.conversationKey,
      userId: user.id,
    })
    if (!conversation) return textReply('找不到对应的 AI 会话，请重新发起请求。')

    const confirmationId = Number(input.taskId)
    if (!Number.isSafeInteger(confirmationId) || confirmationId <= 0) {
      return textReply('确认请求编号无效。')
    }
    const ctx = createChannelHttpContext(user)
    try {
      if (input.actionKey === `confirm:${input.taskId}`) {
        const execution = await confirmAiAgentAction(ctx, {
          confirmationId,
          conversationId: conversation.id,
          userId: user.id,
        })
        return textReply(
          await getAiAgentActionResultMessage({
            confirmationId,
            conversationId: conversation.id,
            userId: user.id,
            result:
              execution.result && typeof execution.result === 'object'
                ? execution.result
                : undefined,
          })
        )
      }
      if (input.actionKey === `cancel:${input.taskId}`) {
        await cancelAiAgentAction(ctx, {
          confirmationId,
          conversationId: conversation.id,
          userId: user.id,
        })
        return textReply('操作已取消。')
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
