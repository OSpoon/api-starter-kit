import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export type AiAgentMcpServerConfiguration = {
  id: string
  transport?: 'stdio' | 'http'
  command?: string
  args?: string[]
  cwd?: string | null
  url?: string
  environment?: string | null
  headers?: string | null
  inheritEnv?: boolean
  stderr?: 'pipe' | 'inherit'
  maxMessageBytes?: number
  maxStderrBytes?: number
  closeTimeoutMs?: number
  openGetStream?: boolean
  reconnect?: {
    initialDelayMs?: number
    maxDelayMs?: number
    maxRetries?: number
  }
  enabled: boolean
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

  @column({ serializeAs: null })
  declare mineruToken: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
