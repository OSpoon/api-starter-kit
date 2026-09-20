import type { LlmConfiguration } from './api'

export type LlmConfigurationDraft = {
  chatApiKey: string
  chatBaseUrl: string
  chatModel: string
  asrApiKey: string
  asrBaseUrl: string
  asrModel: string
  embeddingApiKey: string
  embeddingBaseUrl: string
  embeddingModel: string
  embeddingDimensions: number
  requestTimeoutMs: number
}

export function hasUnsavedLlmConfiguration(
  draft: LlmConfigurationDraft,
  saved: LlmConfiguration | null
) {
  if (!saved) return true

  return Boolean(
    draft.chatApiKey ||
    draft.asrApiKey ||
    draft.embeddingApiKey ||
    draft.chatBaseUrl !== (saved.chat.baseUrl ?? '') ||
    draft.chatModel !== saved.chat.model ||
    draft.asrBaseUrl !== (saved.asr.baseUrl ?? '') ||
    draft.asrModel !== saved.asr.model ||
    draft.embeddingBaseUrl !== (saved.embedding.baseUrl ?? '') ||
    draft.embeddingModel !== (saved.embedding.model ?? '') ||
    draft.embeddingDimensions !== saved.embedding.dimensions ||
    draft.requestTimeoutMs !== saved.requestTimeoutMs
  )
}
