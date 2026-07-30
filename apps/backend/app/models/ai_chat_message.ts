import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export type AiChatRole = 'user' | 'assistant'

export type AiChatCitation = {
  documentId: number
  chunkId: number
  title: string
  excerpt: string
}

function consumeCitations(value: unknown): AiChatCitation[] {
  if (Array.isArray(value)) return value as AiChatCitation[]
  if (typeof value !== 'string') return []

  try {
    const citations = JSON.parse(value)
    return Array.isArray(citations) ? (citations as AiChatCitation[]) : []
  } catch {
    return []
  }
}

export default class AiChatMessage extends BaseModel {
  static table = 'ai_chat_messages'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare conversationId: number

  @column()
  declare role: AiChatRole

  @column()
  declare content: string

  @column({
    prepare: (citations: AiChatCitation[] | null | undefined) => JSON.stringify(citations ?? []),
    consume: consumeCitations,
  })
  declare citations: AiChatCitation[]

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
