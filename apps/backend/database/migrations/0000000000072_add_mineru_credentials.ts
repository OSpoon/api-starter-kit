import encryption from '@adonisjs/core/services/encryption'
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ai_agent_configurations', (table) => {
      table.text('mineru_token').nullable()
    })
    this.schema.alterTable('ai_chat_pdf_attachments', (table) => {
      table.text('batch_token').nullable()
    })
    this.defer(async (db) => {
      const token = process.env.MINERU_API_TOKEN?.trim()
      if (!token) return
      await db
        .from('ai_chat_pdf_attachments')
        .whereNotNull('batch_id')
        .whereNull('markdown')
        .where('failed', false)
        .update({ batch_token: encryption.encrypt(token) })
    })
  }

  async down() {
    this.schema.alterTable('ai_chat_pdf_attachments', (table) => table.dropColumn('batch_token'))
    this.schema.alterTable('ai_agent_configurations', (table) => table.dropColumn('mineru_token'))
  }
}
