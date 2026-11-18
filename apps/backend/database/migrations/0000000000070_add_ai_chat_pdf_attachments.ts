import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ai_chat_messages', (table) => {
      table.string('pdf_name', 255).nullable()
    })
    this.schema.createTable('ai_chat_pdf_attachments', (table) => {
      table
        .integer('message_id')
        .primary()
        .references('id')
        .inTable('ai_chat_messages')
        .onDelete('CASCADE')
      table.binary('pdf_data').nullable()
      table.string('batch_id', 128).nullable()
      table.text('markdown').nullable()
      table.boolean('failed').notNullable().defaultTo(false)
    })
  }

  async down() {
    this.schema.dropTable('ai_chat_pdf_attachments')
    this.schema.alterTable('ai_chat_messages', (table) => table.dropColumn('pdf_name'))
  }
}
