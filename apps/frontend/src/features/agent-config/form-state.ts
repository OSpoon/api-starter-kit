import type { LlmConfiguration, LlmServiceName, UpdateLlmConfigurationInput } from './api'

export type LlmConfigurationDraft = {
  chatApiKey: string
  chatBaseUrl: string
  chatModel: string
  chatContextWindow: number
  chatMaxTokens: number
  asrApiKey: string
  asrBaseUrl: string
  asrModel: string
  embeddingApiKey: string
  embeddingBaseUrl: string
  embeddingModel: string
}

export function hasUnsavedLlmConfiguration(
  draft: Partial<LlmConfigurationDraft>,
  saved: LlmConfiguration | null,
  service?: LlmServiceName
) {
  if (!saved) return true

  const changes: Record<LlmServiceName, boolean> = {
    chat: Boolean(
      draft.chatApiKey ||
      draft.chatBaseUrl !== (saved.chat.baseUrl ?? '') ||
      draft.chatModel !== saved.chat.model ||
      draft.chatContextWindow !== saved.chat.contextWindow ||
      draft.chatMaxTokens !== saved.chat.maxTokens
    ),
    asr: Boolean(
      draft.asrApiKey ||
      draft.asrBaseUrl !== (saved.asr.baseUrl ?? '') ||
      draft.asrModel !== saved.asr.model
    ),
    embedding: Boolean(
      draft.embeddingApiKey ||
      draft.embeddingBaseUrl !== (saved.embedding.baseUrl ?? '') ||
      draft.embeddingModel !== saved.embedding.model
    ),
  }

  return service ? changes[service] : Object.values(changes).some(Boolean)
}

export function buildLlmConfigurationUpdate(
  draft: Partial<LlmConfigurationDraft>,
  saved: LlmConfiguration,
  service: 'chat' | 'asr' | 'embedding'
): UpdateLlmConfigurationInput {
  return {
    chatApiKey: service === 'chat' ? draft.chatApiKey || undefined : undefined,
    chatBaseUrl:
      service === 'chat'
        ? (draft.chatBaseUrl ?? saved.chat.baseUrl ?? '')
        : (saved.chat.baseUrl ?? ''),
    chatModel: service === 'chat' ? (draft.chatModel ?? saved.chat.model) : saved.chat.model,
    chatContextWindow:
      service === 'chat'
        ? (draft.chatContextWindow ?? saved.chat.contextWindow)
        : saved.chat.contextWindow,
    chatMaxTokens:
      service === 'chat' ? (draft.chatMaxTokens ?? saved.chat.maxTokens) : saved.chat.maxTokens,
    asrApiKey: service === 'asr' ? draft.asrApiKey || undefined : undefined,
    asrBaseUrl:
      service === 'asr' ? (draft.asrBaseUrl ?? saved.asr.baseUrl ?? '') : (saved.asr.baseUrl ?? ''),
    asrModel: service === 'asr' ? (draft.asrModel ?? saved.asr.model) : saved.asr.model,
    embeddingApiKey: service === 'embedding' ? draft.embeddingApiKey || undefined : undefined,
    embeddingBaseUrl:
      service === 'embedding'
        ? (draft.embeddingBaseUrl ?? saved.embedding.baseUrl ?? '')
        : (saved.embedding.baseUrl ?? ''),
    embeddingModel:
      service === 'embedding'
        ? (draft.embeddingModel ?? saved.embedding.model ?? '')
        : (saved.embedding.model ?? ''),
    embeddingDimensions: 1024,
  }
}
