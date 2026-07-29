import { BaseModel, column, hasMany, manyToMany } from '@adonisjs/lucid/orm'
import type { HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'

import KnowledgeChunk from '#models/knowledge_chunk'
import Role from '#models/role'

export default class KnowledgeDocument extends BaseModel {
  static table = 'knowledge_documents'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare title: string

  @column()
  declare content: string

  @column()
  declare requiredPermission: string | null

  @column()
  declare contentHash: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @hasMany(() => KnowledgeChunk, { foreignKey: 'documentId' })
  declare chunks: HasMany<typeof KnowledgeChunk>

  @manyToMany(() => Role, {
    pivotTable: 'knowledge_document_roles',
    pivotForeignKey: 'document_id',
    pivotRelatedForeignKey: 'role_id',
    pivotTimestamps: { createdAt: 'created_at', updatedAt: false },
  })
  declare roles: ManyToMany<typeof Role>
}
