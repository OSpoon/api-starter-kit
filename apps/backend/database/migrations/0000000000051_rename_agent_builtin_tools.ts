import { BaseSchema } from '@adonisjs/lucid/schema'

const renamedTools = {
  propose_api_key_creation: 'create_api_key',
  propose_api_key_revocation: 'revoke_api_key',
  propose_api_key_deletion: 'delete_api_key',
  propose_system_management_change: 'system_management_change',
  propose_wecom_message_send: 'send_wecom_message',
} as const

function renameTools(value: unknown, names: Record<string, string>) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value
  return Array.isArray(parsed)
    ? [...new Set(parsed.map((name) => (typeof name === 'string' ? (names[name] ?? name) : name)))]
    : parsed
}

function renameModes(value: unknown, names: Record<string, string>) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return parsed
  const result = { ...(parsed as Record<string, unknown>) }
  for (const [oldName, newName] of Object.entries(names)) {
    if (oldName in result) {
      result[newName] ??= result[oldName]
      delete result[oldName]
    }
  }
  return result
}

export default class extends BaseSchema {
  async up() {
    const configurations = await this.db
      .from('ai_agent_configurations')
      .select('id', 'enabled_tools', 'tool_modes')
    for (const configuration of configurations) {
      await this.db
        .from('ai_agent_configurations')
        .where('id', configuration.id)
        .update({
          enabled_tools: renameTools(configuration.enabled_tools, renamedTools),
          tool_modes: renameModes(configuration.tool_modes, renamedTools),
        })
    }
  }

  async down() {
    const reverseNames = Object.fromEntries(
      Object.entries(renamedTools).map(([oldName, newName]) => [newName, oldName])
    )
    const configurations = await this.db
      .from('ai_agent_configurations')
      .select('id', 'enabled_tools', 'tool_modes')
    for (const configuration of configurations) {
      await this.db
        .from('ai_agent_configurations')
        .where('id', configuration.id)
        .update({
          enabled_tools: renameTools(configuration.enabled_tools, reverseNames),
          tool_modes: renameModes(configuration.tool_modes, reverseNames),
        })
    }
  }
}
