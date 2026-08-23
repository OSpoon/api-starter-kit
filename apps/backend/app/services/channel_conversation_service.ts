import AiChatConversation from '#models/ai_chat_conversation'
import ChannelConversation from '#models/channel_conversation'
import type { ChannelName } from '#models/channel_identity'

export async function findOrCreateChannelConversation(input: {
  channel: ChannelName
  externalTenantId: string
  externalConversationKey: string
  userId: number
}) {
  const existing = await ChannelConversation.query()
    .where('channel', input.channel)
    .where('external_tenant_id', input.externalTenantId)
    .where('external_conversation_key', input.externalConversationKey)
    .first()

  if (existing) {
    if (existing.userId !== input.userId) {
      throw new Error('外部会话已绑定到其他系统用户')
    }
    return AiChatConversation.findOrFail(existing.conversationId)
  }

  const conversation = await AiChatConversation.create({
    userId: input.userId,
    title: `${input.channel} assistant`,
  })

  await ChannelConversation.create({
    channel: input.channel,
    externalTenantId: input.externalTenantId,
    externalConversationKey: input.externalConversationKey,
    userId: input.userId,
    conversationId: conversation.id,
  })

  return conversation
}

export async function findChannelConversation(input: {
  channel: ChannelName
  externalTenantId: string
  externalConversationKey: string
  userId: number
}) {
  const mapping = await ChannelConversation.query()
    .where('channel', input.channel)
    .where('external_tenant_id', input.externalTenantId)
    .where('external_conversation_key', input.externalConversationKey)
    .where('user_id', input.userId)
    .first()
  return mapping ? AiChatConversation.findOrFail(mapping.conversationId) : null
}

export async function startNewChannelConversation(input: {
  channel: ChannelName
  externalTenantId: string
  externalConversationKey: string
  userId: number
}) {
  const mapping = await ChannelConversation.query()
    .where('channel', input.channel)
    .where('external_tenant_id', input.externalTenantId)
    .where('external_conversation_key', input.externalConversationKey)
    .first()

  if (mapping && mapping.userId !== input.userId) {
    throw new Error('外部会话已绑定到其他系统用户')
  }

  const conversation = await AiChatConversation.create({
    userId: input.userId,
    title: `${input.channel} assistant`,
  })

  if (mapping) {
    mapping.merge({ conversationId: conversation.id })
    await mapping.save()
  } else {
    await ChannelConversation.create({
      channel: input.channel,
      externalTenantId: input.externalTenantId,
      externalConversationKey: input.externalConversationKey,
      userId: input.userId,
      conversationId: conversation.id,
    })
  }

  return conversation
}
