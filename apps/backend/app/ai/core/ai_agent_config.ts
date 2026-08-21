import { readRuntimeLlmConfiguration } from '#services/llm_configuration_service'

export function getAiAgentModelName() {
  return 'runtime'
}

export function getAiAgentSummarizationOptions() {
  return {
    enabled: true,
    thresholdTokens: 6000,
  }
}

export async function getAiRequestTimeout() {
  const config = await readRuntimeLlmConfiguration()
  return config.requestTimeoutMs
}
