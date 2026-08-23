import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export default class LlmConfiguration extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column({ serializeAs: null })
  declare chatApiKey: string | null

  @column()
  declare chatBaseUrl: string | null

  @column()
  declare chatModel: string

  @column({ serializeAs: null })
  declare embeddingApiKey: string | null

  @column()
  declare embeddingBaseUrl: string | null

  @column()
  declare embeddingModel: string | null

  @column()
  declare embeddingDimensions: number

  @column()
  declare requestTimeoutMs: number

  @column()
  declare wecomBotId: string | null

  @column({ serializeAs: null })
  declare wecomBotSecret: string | null

  @column()
  declare wecomBotTenantId: string | null

  @column()
  declare wecomBotWsUrl: string | null

  @column()
  declare feishuAppId: string | null

  @column({ serializeAs: null })
  declare feishuAppSecret: string | null

  @column()
  declare feishuDomain: string | null

  @column()
  declare dingtalkClientId: string | null

  @column({ serializeAs: null })
  declare dingtalkClientSecret: string | null

  @column()
  declare dingtalkCardTemplateId: string | null

  @column()
  declare dingtalkStreamingCardTemplateId: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
