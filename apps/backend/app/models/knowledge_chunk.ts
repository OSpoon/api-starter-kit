import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'

import KnowledgeDocument from '#models/knowledge_document'

export default class KnowledgeChunk extends BaseModel {
  static table = 'knowledge_chunks'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare documentId: number

  @column()
  declare chunkIndex: number

  @column()
  declare content: string

  @column()
  declare embeddingModel: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => KnowledgeDocument, { foreignKey: 'documentId' })
  declare document: BelongsTo<typeof KnowledgeDocument>
}
