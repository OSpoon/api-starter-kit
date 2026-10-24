const readToolNames = new Set([
  'diagnose_my_access',
  'run_registered_query',
  'search_knowledge_catalog',
  'search_knowledge',
])

export const maxConsecutiveAiAgentReadToolFailures = 2

export function isAiAgentReadTool(toolName: string) {
  return readToolNames.has(toolName)
}

export function isRecoverableAiAgentReadToolError(toolName: string, output: unknown) {
  if (!isAiAgentReadTool(toolName) || !output || typeof output !== 'object') return false

  const result = output as { kind?: unknown; code?: unknown }
  return (
    (result.kind === 'action_error' || result.kind === 'query_error') &&
    result.code !== 'permission_denied'
  )
}

export function isAiAgentTerminalToolResult(toolName: string, output: unknown) {
  if (!output || typeof output !== 'object') return false
  if (isRecoverableAiAgentReadToolError(toolName, output)) return false

  const kind = (output as { kind?: unknown }).kind
  return kind === 'confirmation' || kind === 'action_error' || kind === 'query_error'
}
