import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export type AiAutomationRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type AiAutomationDeliveryStatus = 'sent' | 'failed'
export type AiAutomationDeliveryResults = Partial<
  Record<'webhook', { status: AiAutomationDeliveryStatus; error?: string }>
>

function consumeJson<T>(value: unknown): T {
  return (typeof value === 'string' ? JSON.parse(value) : value) as T
}

export default class AiAutomationRun extends BaseModel {
  static table = 'ai_automation_runs'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare automationId: number | null

  @column()
  declare userId: number

  @column()
  declare automationName: string

  @column()
  declare triggerKind: 'scheduled' | 'manual'

  @column()
  declare status: AiAutomationRunStatus

  @column.dateTime()
  declare scheduledFor: DateTime

  @column.dateTime()
  declare startedAt: DateTime | null

  @column.dateTime()
  declare heartbeatAt: DateTime | null

  @column.dateTime()
  declare completedAt: DateTime | null

  @column()
  declare attemptCount: number

  @column()
  declare summary: string | null

  @column()
  declare error: string | null

  @column({
    prepare: (value: AiAutomationDeliveryResults | null | undefined) => JSON.stringify(value ?? {}),
    consume: (value: unknown) => consumeJson<AiAutomationDeliveryResults>(value),
  })
  declare deliveryResults: AiAutomationDeliveryResults

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
