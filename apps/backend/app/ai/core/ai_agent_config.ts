import { LLM_REQUEST_TIMEOUT_MS } from '#services/llm_configuration_service'

export function getAiAgentModelName() {
  return 'runtime'
}

export function getAiAgentSummarizationOptions() {
  return {
    enabled: true,
    thresholdTokens: 6000,
  }
}

export function getAiRequestTimeout() {
  return LLM_REQUEST_TIMEOUT_MS
}
