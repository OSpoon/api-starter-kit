export function summarizeAiAgentToolParameters(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return []
  const summary: Array<{ name: string; type: string }> = []
  for (const [name, value] of Object.entries(input as Record<string, unknown>).slice(0, 12)) {
    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
    summary.push({ name: name.slice(0, 80), type })
  }
  return summary
}
