import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export type AiAutomationScheduleKind = 'once' | 'daily' | 'weekdays' | 'weekly' | 'cron'
export type AiAutomationWebhookType = 'generic' | 'wecom'

export default class AiAutomation extends BaseModel {
  static table = 'ai_automations'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare name: string

  @column()
  declare prompt: string

  @column()
  declare scheduleKind: AiAutomationScheduleKind

  @column.dateTime()
  declare scheduleAt: DateTime | null

  @column()
  declare scheduleTime: string | null

  @column()
  declare scheduleCron: string | null

  @column()
  declare scheduleWeekday: number | null

  @column()
  declare timezone: string

  @column.dateTime()
  declare nextRunAt: DateTime | null

  @column()
  declare enabled: boolean

  @column()
  declare encryptedWebhookUrl: string | null

  @column()
  declare webhookType: AiAutomationWebhookType

  @column.dateTime()
  declare deletedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
