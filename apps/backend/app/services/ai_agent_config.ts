import env from '#start/env'

export function getAiAgentModelName() {
  return env.get('AI_OPENAI_MODEL') ?? 'gpt-4o-mini'
}

export function getAiAgentSummarizationOptions() {
  return {
    enabled: env.get('AI_CONTEXT_COMPRESSION_ENABLED') ?? true,
    thresholdTokens: env.get('AI_CONTEXT_COMPRESSION_THRESHOLD_TOKENS') ?? 6000,
    recentMessageCount: env.get('AI_CONTEXT_COMPRESSION_RECENT_MESSAGES') ?? 8,
  }
}

export function getAiRequestTimeout() {
  return Math.min(Math.max(env.get('AI_REQUEST_TIMEOUT_MS') ?? 180_000, 5_000), 300_000)
}
