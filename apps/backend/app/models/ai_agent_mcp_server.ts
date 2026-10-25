import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export type AiAgentMcpToolConfiguration = {
  mode: 'read' | 'confirm'
}

export default class AiAgentMcpServer extends BaseModel {
  static table = 'ai_agent_mcp_servers'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare command: string

  @column({ prepare: (value: string[]) => JSON.stringify(value) })
  declare args: string[]

  @column()
  declare cwd: string | null

  @column({ serializeAs: null })
  declare environment: string | null

  @column()
  declare enabled: boolean

  @column()
  declare enabledTools: Record<string, AiAgentMcpToolConfiguration>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
