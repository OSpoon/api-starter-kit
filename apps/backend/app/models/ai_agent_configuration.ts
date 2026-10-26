import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export type AiAgentMcpToolConfiguration = { mode: 'read' | 'confirm' }

export type AiAgentMcpServerConfiguration = {
  id: string
  command: string
  args: string[]
  cwd: string | null
  environment: string | null
  enabled: boolean
  enabledTools: Record<string, AiAgentMcpToolConfiguration>
  updatedAt: string
}

export default class AiAgentConfiguration extends BaseModel {
  static table = 'ai_agent_configurations'

  @column({ isPrimary: true })
  declare id: number

  @column({ prepare: (value: string[]) => JSON.stringify(value) })
  declare enabledTools: string[]

  @column()
  declare toolModes: Record<string, 'direct' | 'confirm'>

  @column()
  declare mcpServers: Record<string, AiAgentMcpServerConfiguration>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
