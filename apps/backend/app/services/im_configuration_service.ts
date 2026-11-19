import encryption from '@adonisjs/core/services/encryption'
import logger from '@adonisjs/core/services/logger'

import type { ChannelName } from '#models/channel_identity'
import ImBot from '#models/im_bot'
import { notifyImConfigurationChanged } from '#services/im_configuration_change_service'

export type ImBotInput = {
  name?: string
  channel?: ChannelName
  identifier?: string | null
  secret?: string | null
  tenantId?: string | null
  endpoint?: string | null
  cardTemplateId?: string | null
  streamingCardTemplateId?: string | null
  enabled?: boolean
}

function encryptSecret(value?: string | null) {
  return value?.trim() ? encryption.encrypt(value.trim()) : null
}

function serializeImBot(bot: ImBot) {
  return {
    id: bot.id,
    name: bot.name,
    channel: bot.channel,
    identifier: bot.identifier,
    tenantId: bot.tenantId,
    endpoint: bot.endpoint,
    cardTemplateId: bot.cardTemplateId,
    streamingCardTemplateId: bot.streamingCardTemplateId,
    enabled: bot.enabled,
    secretConfigured: Boolean(bot.secret),
    updatedAt: bot.updatedAt.toISO(),
  }
}

export async function listImBots(input: {
  page: number
  limit: number
  search?: string
  channels?: ChannelName[]
}) {
  const query = ImBot.query().orderBy('id', 'desc')
  if (input.channels?.length) query.whereIn('channel', input.channels)
  if (input.search) {
    query.where((builder) => {
      builder
        .whereILike('name', `%${input.search}%`)
        .orWhereILike('identifier', `%${input.search}%`)
    })
  }
  const paginator = await query.paginate(input.page, input.limit)
  return { items: paginator.all().map(serializeImBot), meta: paginator.getMeta() }
}

export async function createImBot(input: ImBotInput) {
  const bot = await ImBot.create({
    name: input.name!.trim(),
    channel: input.channel!,
    identifier: input.identifier?.trim() || null,
    secret: encryptSecret(input.secret),
    tenantId: input.tenantId?.trim() || null,
    endpoint: input.endpoint?.trim() || null,
    cardTemplateId: input.cardTemplateId?.trim() || null,
    streamingCardTemplateId: input.streamingCardTemplateId?.trim() || null,
    enabled: input.enabled ?? true,
  })
  await notifyImConfigurationChanged()
  return serializeImBot(bot)
}

export async function updateImBot(bot: ImBot, input: ImBotInput) {
  if (input.name?.trim()) bot.name = input.name.trim()
  let runtimeChanged = false
  for (const field of [
    'identifier',
    'tenantId',
    'endpoint',
    'cardTemplateId',
    'streamingCardTemplateId',
  ] as const) {
    const value = input[field]?.trim()
    if (!value || value === bot[field]) continue
    bot[field] = value
    runtimeChanged = true
  }
  if (input.secret?.trim()) {
    bot.secret = encryptSecret(input.secret)
    runtimeChanged = true
  }
  if (input.enabled !== undefined && input.enabled !== bot.enabled) {
    bot.enabled = input.enabled
    runtimeChanged = true
  }
  await bot.save()
  if (runtimeChanged) await notifyImConfigurationChanged()
  return serializeImBot(bot)
}

export async function listRuntimeImBots(channel: ChannelName) {
  const bots = await ImBot.query().where('channel', channel).where('enabled', true).orderBy('id')
  return bots.flatMap((bot) => {
    let secret: string | null = null
    try {
      secret = bot.secret ? encryption.decrypt<string>(bot.secret) : null
    } catch (error) {
      logger.error({ err: error, botId: bot.id }, 'Unable to decrypt IM bot secret')
    }
    if (!bot.identifier || !secret || (channel === 'wecom' && !bot.tenantId)) return []
    return [
      {
        id: String(bot.id),
        name: bot.name,
        identifier: bot.identifier,
        secret,
        tenantId: bot.tenantId ?? undefined,
        endpoint: bot.endpoint ?? undefined,
        cardTemplateId: bot.cardTemplateId ?? undefined,
        streamingCardTemplateId: bot.streamingCardTemplateId ?? undefined,
        legacyIdentity: bot.legacyIdentity,
      },
    ]
  })
}
