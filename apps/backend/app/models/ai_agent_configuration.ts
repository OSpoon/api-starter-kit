import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export default class AiAgentConfiguration extends BaseModel {
  static table = 'ai_agent_configurations'

  @column({ isPrimary: true })
  declare id: number

  @column({ prepare: (value: string[]) => JSON.stringify(value) })
  declare enabledTools: string[]

  @column()
  declare toolModes: Record<string, 'direct' | 'confirm'>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
