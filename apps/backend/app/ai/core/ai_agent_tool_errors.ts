const readToolNames = new Set([
  'diagnose_my_access',
  'run_registered_query',
  'search_knowledge_catalog',
  'search_knowledge',
])

export const maxConsecutiveAiAgentReadToolFailures = 2

export function sanitizeAiAgentToolErrorMessage(value: unknown) {
  if (typeof value !== 'string') return undefined
  const message = value
    .split(/\r?\n/, 1)[0]!
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(
      /\b(password|secret|token|authorization|api[\s_-]?key|cookie)(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      '$1$2[redacted]'
    )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
  return message || undefined
}

export function isAiAgentReadTool(toolName: string) {
  return readToolNames.has(toolName) || toolName.startsWith('mcp_read_')
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
  return kind === 'action_error' || kind === 'query_error'
}
