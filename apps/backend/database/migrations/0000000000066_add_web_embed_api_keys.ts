import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('api_keys', (table) => {
      table.string('kind', 24).notNullable().defaultTo('integration')
    })

    this.schema.alterTable('ai_chat_conversations', (table) => {
      table.string('embed_session_id', 36).nullable()
      table.index(['api_key_id', 'user_id', 'embed_session_id'], 'ai_chat_embed_session_idx')
    })
  }

  async down() {
    this.schema.alterTable('ai_chat_conversations', (table) => {
      table.dropIndex(['api_key_id', 'user_id', 'embed_session_id'], 'ai_chat_embed_session_idx')
      table.dropColumn('embed_session_id')
    })

    this.schema.alterTable('api_keys', (table) => {
      table.dropColumn('kind')
    })
  }
}
