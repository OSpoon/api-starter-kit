import encryption from '@adonisjs/core/services/encryption'

import LlmConfiguration from '#models/llm_configuration'

type LlmConfigInput = {
  chatApiKey?: string | null
  chatBaseUrl?: string | null
  chatModel: string
  asrApiKey?: string | null
  asrBaseUrl?: string | null
  asrModel: string
  embeddingApiKey?: string | null
  embeddingBaseUrl?: string | null
  embeddingModel?: string | null
  embeddingDimensions: number
  requestTimeoutMs: number
}

export type ImConfigInput = {
  wecomBotId?: string | null
  wecomBotSecret?: string | null
  wecomBotTenantId?: string | null
  wecomBotWsUrl?: string | null
  feishuAppId?: string | null
  feishuAppSecret?: string | null
  feishuDomain?: string | null
  dingtalkClientId?: string | null
  dingtalkClientSecret?: string | null
  dingtalkCardTemplateId?: string | null
  dingtalkStreamingCardTemplateId?: string | null
}

function encryptSecret(value?: string | null) {
  return value?.trim() ? encryption.encrypt(value.trim()) : null
}

function decryptSecret(value?: string | null) {
  return value ? encryption.decrypt<string>(value) : null
}

export async function getLlmConfiguration() {
  const existing = await LlmConfiguration.find(1)
  if (existing) return existing
  return LlmConfiguration.create({
    id: 1,
    chatModel: 'gpt-4o-mini',
    asrModel: 'Qwen3-ASR-0.6B-4bit',
    embeddingModel: null,
    embeddingDimensions: 1024,
    requestTimeoutMs: 180000,
  })
}

export async function getImConfiguration() {
  return getLlmConfiguration()
}

export async function readRuntimeLlmConfiguration() {
  const config = await getLlmConfiguration()
  return {
    chat: {
      apiKey: decryptSecret(config.chatApiKey) ?? 'no-key',
      baseURL: config.chatBaseUrl,
      model: config.chatModel,
    },
    asr: {
      apiKey: decryptSecret(config.asrApiKey),
      baseURL: config.asrBaseUrl,
      model: config.asrModel,
    },
    embedding: {
      apiKey: decryptSecret(config.embeddingApiKey) ?? decryptSecret(config.chatApiKey) ?? 'no-key',
      baseURL: config.embeddingBaseUrl ?? config.chatBaseUrl,
      model: config.embeddingModel,
      dimensions: config.embeddingDimensions,
    },
    requestTimeoutMs: config.requestTimeoutMs,
  }
}

export async function readRuntimeWecomBotConfiguration() {
  const config = await getLlmConfiguration()
  const botId = config.wecomBotId?.trim() || null
  const secret = decryptSecret(config.wecomBotSecret)
  const tenantId = config.wecomBotTenantId?.trim() || null
  if (!botId || !secret || !tenantId) return null

  return {
    botId,
    secret,
    tenantId,
    wsUrl: config.wecomBotWsUrl?.trim() || undefined,
  }
}

export async function readRuntimeFeishuBotConfiguration() {
  const config = await getLlmConfiguration()
  const appId = config.feishuAppId?.trim() || null
  const secret = decryptSecret(config.feishuAppSecret)
  if (!appId || !secret) return null

  return {
    appId,
    secret,
    domain: config.feishuDomain?.trim() || undefined,
  }
}

export async function readRuntimeDingTalkBotConfiguration() {
  const config = await getLlmConfiguration()
  const clientId = config.dingtalkClientId?.trim() || null
  const clientSecret = decryptSecret(config.dingtalkClientSecret)
  const cardTemplateId = config.dingtalkCardTemplateId?.trim() || null
  const streamingCardTemplateId = config.dingtalkStreamingCardTemplateId?.trim() || null
  if (!clientId || !clientSecret) return null

  return { clientId, clientSecret, cardTemplateId, streamingCardTemplateId }
}

export async function updateLlmConfiguration(input: LlmConfigInput) {
  const config = await getLlmConfiguration()
  config.chatBaseUrl = input.chatBaseUrl?.trim() || null
  config.chatModel = input.chatModel.trim()
  config.asrBaseUrl = input.asrBaseUrl?.trim() || null
  config.asrModel = input.asrModel.trim()
  config.embeddingBaseUrl = input.embeddingBaseUrl?.trim() || null
  config.embeddingModel = input.embeddingModel?.trim() || null
  config.embeddingDimensions = input.embeddingDimensions
  config.requestTimeoutMs = input.requestTimeoutMs
  if (input.chatApiKey?.trim()) config.chatApiKey = encryptSecret(input.chatApiKey)
  if (input.asrApiKey?.trim()) config.asrApiKey = encryptSecret(input.asrApiKey)
  if (input.embeddingApiKey?.trim()) config.embeddingApiKey = encryptSecret(input.embeddingApiKey)
  await config.save()
  return config
}

export async function updateImConfiguration(input: ImConfigInput) {
  const config = await getImConfiguration()
  config.wecomBotId = input.wecomBotId?.trim() || null
  config.wecomBotTenantId = input.wecomBotTenantId?.trim() || null
  config.wecomBotWsUrl = input.wecomBotWsUrl?.trim() || null
  config.feishuAppId = input.feishuAppId?.trim() || null
  config.feishuDomain = input.feishuDomain?.trim() || null
  config.dingtalkClientId = input.dingtalkClientId?.trim() || null
  config.dingtalkCardTemplateId = input.dingtalkCardTemplateId?.trim() || null
  config.dingtalkStreamingCardTemplateId = input.dingtalkStreamingCardTemplateId?.trim() || null
  if (input.wecomBotSecret?.trim()) config.wecomBotSecret = encryptSecret(input.wecomBotSecret)
  if (input.feishuAppSecret?.trim()) config.feishuAppSecret = encryptSecret(input.feishuAppSecret)
  if (input.dingtalkClientSecret?.trim()) {
    config.dingtalkClientSecret = encryptSecret(input.dingtalkClientSecret)
  }
  await config.save()
  return config
}

export function serializeLlmConfiguration(config: LlmConfiguration) {
  return {
    chat: {
      baseUrl: config.chatBaseUrl,
      model: config.chatModel,
      apiKeyConfigured: Boolean(config.chatApiKey),
    },
    asr: {
      baseUrl: config.asrBaseUrl,
      model: config.asrModel,
      apiKeyConfigured: Boolean(config.asrApiKey),
    },
    embedding: {
      baseUrl: config.embeddingBaseUrl,
      model: config.embeddingModel,
      dimensions: config.embeddingDimensions,
      apiKeyConfigured: Boolean(config.embeddingApiKey || config.chatApiKey),
    },
    requestTimeoutMs: config.requestTimeoutMs,
    updatedAt: config.updatedAt.toISO(),
  }
}

export function serializeImConfiguration(config: LlmConfiguration) {
  return {
    wecomBot: {
      botId: config.wecomBotId,
      tenantId: config.wecomBotTenantId,
      wsUrl: config.wecomBotWsUrl,
      secretConfigured: Boolean(config.wecomBotSecret),
    },
    feishuBot: {
      appId: config.feishuAppId,
      domain: config.feishuDomain,
      secretConfigured: Boolean(config.feishuAppSecret),
    },
    dingtalkBot: {
      clientId: config.dingtalkClientId,
      cardTemplateId: config.dingtalkCardTemplateId,
      streamingCardTemplateId: config.dingtalkStreamingCardTemplateId,
      clientSecretConfigured: Boolean(config.dingtalkClientSecret),
    },
    updatedAt: config.updatedAt.toISO(),
  }
}
