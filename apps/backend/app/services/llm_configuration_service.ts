import encryption from '@adonisjs/core/services/encryption'

import type { AiAgentThinkingLevel } from '#ai/core/ai_agent_config'
import LlmConfiguration from '#models/llm_configuration'

const DEFAULT_EMBEDDING_MODEL = 'Qwen3-Embedding-0.6B-4bit-DWQ'

export const LLM_REQUEST_TIMEOUT_MS = 180_000

type LlmConfigInput = {
  chatApiKey?: string | null
  chatBaseUrl?: string | null
  chatModel: string
  chatContextWindow: number
  chatMaxTokens: number
  chatReasoningLevel?: AiAgentThinkingLevel
  asrApiKey?: string | null
  asrBaseUrl?: string | null
  asrModel: string
  embeddingApiKey?: string | null
  embeddingBaseUrl?: string | null
  embeddingModel?: string | null
  embeddingDimensions: number
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
    chatModel: 'Qwen3.5-4B-MLX-4bit',
    chatContextWindow: 128000,
    chatMaxTokens: 16384,
    chatReasoningLevel: 'medium',
    asrModel: 'Qwen3-ASR-0.6B-4bit',
    embeddingModel: DEFAULT_EMBEDDING_MODEL,
    embeddingDimensions: 1024,
  })
}

export async function readRuntimeLlmConfiguration() {
  const config = await getLlmConfiguration()
  return {
    chat: {
      apiKey: decryptSecret(config.chatApiKey) ?? 'no-key',
      baseURL: config.chatBaseUrl,
      model: config.chatModel,
      contextWindow: config.chatContextWindow,
      maxTokens: config.chatMaxTokens,
      reasoningLevel: config.chatReasoningLevel,
    },
    asr: {
      apiKey: decryptSecret(config.asrApiKey),
      baseURL: config.asrBaseUrl,
      model: config.asrModel,
    },
    embedding: {
      apiKey: decryptSecret(config.embeddingApiKey) ?? decryptSecret(config.chatApiKey) ?? 'no-key',
      baseURL: config.embeddingBaseUrl ?? config.chatBaseUrl,
      model: config.embeddingModel ?? DEFAULT_EMBEDDING_MODEL,
    },
  }
}

export async function updateLlmConfiguration(input: LlmConfigInput) {
  const config = await getLlmConfiguration()
  config.chatBaseUrl = input.chatBaseUrl?.trim() || null
  config.chatModel = input.chatModel.trim()
  config.chatContextWindow = input.chatContextWindow
  config.chatMaxTokens = input.chatMaxTokens
  if (input.chatReasoningLevel !== undefined) config.chatReasoningLevel = input.chatReasoningLevel
  config.asrBaseUrl = input.asrBaseUrl?.trim() || null
  config.asrModel = input.asrModel.trim()
  config.embeddingBaseUrl = input.embeddingBaseUrl?.trim() || null
  config.embeddingModel = input.embeddingModel?.trim() || null
  config.embeddingDimensions = 1024
  if (input.chatApiKey?.trim()) config.chatApiKey = encryptSecret(input.chatApiKey)
  if (input.asrApiKey?.trim()) config.asrApiKey = encryptSecret(input.asrApiKey)
  if (input.embeddingApiKey?.trim()) config.embeddingApiKey = encryptSecret(input.embeddingApiKey)
  await config.save()
  return config
}

export function serializeLlmConfiguration(config: LlmConfiguration) {
  return {
    chat: {
      baseUrl: config.chatBaseUrl,
      model: config.chatModel,
      contextWindow: config.chatContextWindow,
      maxTokens: config.chatMaxTokens,
      reasoningLevel: config.chatReasoningLevel,
      apiKeyConfigured: Boolean(config.chatApiKey),
    },
    asr: {
      baseUrl: config.asrBaseUrl,
      model: config.asrModel,
      apiKeyConfigured: Boolean(config.asrApiKey),
    },
    embedding: {
      baseUrl: config.embeddingBaseUrl,
      model: config.embeddingModel ?? DEFAULT_EMBEDDING_MODEL,
      dimensions: 1024,
      apiKeyConfigured: Boolean(config.embeddingApiKey || config.chatApiKey),
    },
    updatedAt: config.updatedAt.toISO(),
  }
}
