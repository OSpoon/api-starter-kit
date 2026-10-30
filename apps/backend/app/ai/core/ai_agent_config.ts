import { LLM_REQUEST_TIMEOUT_MS } from '#services/llm_configuration_service'
import env from '#start/env'

export function getAiAgentModelName() {
  return 'runtime'
}

export function getAiAgentSummarizationOptions() {
  const clampTokens = (value: number | undefined, fallback: number, maximum: number) =>
    Math.min(Math.max(Math.floor(value ?? fallback), 128), maximum)
  const maxInputTokens = clampTokens(
    env.get('AI_AGENT_CONTEXT_SUMMARY_MAX_INPUT_TOKENS'),
    6000,
    32000
  )

  return {
    enabled: env.get('AI_AGENT_CONTEXT_SUMMARY_ENABLED') ?? true,
    thresholdTokens: maxInputTokens,
    maxInputTokens,
    maxOutputTokens: clampTokens(env.get('AI_AGENT_CONTEXT_SUMMARY_MAX_OUTPUT_TOKENS'), 1200, 8192),
  }
}

export function getAiRequestTimeout() {
  return LLM_REQUEST_TIMEOUT_MS
}
