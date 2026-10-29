export const builtInAiAgentToolNames = [
  'diagnose_my_access',
  'run_registered_query',
  'search_knowledge_catalog',
  'search_knowledge',
  'revoke_api_key',
  'delete_api_key',
  'system_management_change',
  'create_api_key',
  'send_wecom_message',
] as const

export type BuiltInAiAgentToolName = (typeof builtInAiAgentToolNames)[number]

export const builtInAiAgentToolsRequiringConfirmation = [
  'revoke_api_key',
  'delete_api_key',
  'system_management_change',
  'create_api_key',
  'send_wecom_message',
] as const satisfies readonly BuiltInAiAgentToolName[]

const builtInAiAgentToolsWithFixedPolicy = [
  'diagnose_my_access',
  'search_knowledge_catalog',
  'search_knowledge',
] as const satisfies readonly BuiltInAiAgentToolName[]

export type AiAgentToolMode = 'direct' | 'confirm'

export function requiresAiAgentToolConfirmation(name: BuiltInAiAgentToolName) {
  return builtInAiAgentToolsRequiringConfirmation.some((tool) => tool === name)
}

export function canConfigureAiAgentToolMode(name: BuiltInAiAgentToolName) {
  return (
    !requiresAiAgentToolConfirmation(name) &&
    !builtInAiAgentToolsWithFixedPolicy.some((tool) => tool === name)
  )
}

export function defaultAiAgentToolMode(name: BuiltInAiAgentToolName): AiAgentToolMode {
  return requiresAiAgentToolConfirmation(name) ? 'confirm' : 'direct'
}
