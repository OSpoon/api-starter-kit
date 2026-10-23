import crypto from 'node:crypto'

import hash from '@adonisjs/core/services/hash'
import { BaseSchema } from '@adonisjs/lucid/schema'

const integrationEmail = 'ai-integration@internal.invalid'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('api_keys', (table) => table.dropColumn('permissions'))
    this.schema.alterTable('ai_chat_conversations', (table) => {
      table.integer('api_key_id').unsigned().nullable()
      table.foreign('api_key_id').references('api_keys.id').onDelete('CASCADE')
      table.index(['api_key_id', 'user_id'])
    })

    const now = new Date()
    await this.db
      .from('permissions')
      .where('code', 'api-keys:create')
      .update({ name: '创建全局 AI 助手密钥', updated_at: now })

    let user = await this.db.from('users').where('email', integrationEmail).select('id').first()
    if (!user) {
      await this.db.table('users').insert({
        full_name: 'AI API 集成主体',
        email: integrationEmail,
        password: await hash.make(crypto.randomBytes(32).toString('base64url')),
        disabled_at: now,
        created_at: now,
      })
      user = await this.db.from('users').where('email', integrationEmail).select('id').firstOrFail()
    } else {
      await this.db.from('users').where('id', user.id).update({ disabled_at: now, updated_at: now })
    }

    const role = await this.db.from('roles').where('code', 'super-admin').select('id').firstOrFail()
    await this.db
      .table('user_roles')
      .insert({ user_id: user.id, role_id: role.id, created_at: now })
      .onConflict(['user_id', 'role_id'])
      .ignore()
  }

  async down() {
    const user = await this.db.from('users').where('email', integrationEmail).select('id').first()
    if (user) {
      const hasConversations = await this.db
        .from('ai_chat_conversations')
        .where('user_id', user.id)
        .first()
      if (hasConversations) {
        throw new Error('Cannot remove the AI integration principal while its conversations exist')
      }
      const hasUsage = await this.db.from('ai_usage_events').where('user_id', user.id).first()
      if (hasUsage) {
        throw new Error('Cannot remove the AI integration principal while its usage records exist')
      }
      await this.db.from('user_roles').where('user_id', user.id).delete()
      await this.db.from('users').where('id', user.id).delete()
    }

    this.schema.alterTable('ai_chat_conversations', (table) => {
      table.dropForeign(['api_key_id'])
      table.dropIndex(['api_key_id', 'user_id'])
      table.dropColumn('api_key_id')
    })
    this.schema.alterTable('api_keys', (table) => {
      table.jsonb('permissions').notNullable().defaultTo('[]')
    })
  }
}
