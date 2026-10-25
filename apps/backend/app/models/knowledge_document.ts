import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'

import KnowledgeChunk from '#models/knowledge_chunk'

function consumeTopics(value: unknown): string[] {
  const topics = typeof value === 'string' ? JSON.parse(value) : value
  if (!Array.isArray(topics) || !topics.every((topic) => typeof topic === 'string')) {
    throw new TypeError('Invalid JSON array in knowledge_documents.topics')
  }
  return topics
}

export default class KnowledgeDocument extends BaseModel {
  static table = 'knowledge_documents'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare title: string

  @column()
  declare content: string

  @column()
  declare enabled: boolean

  @column()
  declare summary: string | null

  @column({
    prepare: (value: string[] | null | undefined) => JSON.stringify(value ?? []),
    consume: consumeTopics,
  })
  declare topics: string[]

  @column()
  declare contentHash: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @hasMany(() => KnowledgeChunk, { foreignKey: 'documentId' })
  declare chunks: HasMany<typeof KnowledgeChunk>
}
