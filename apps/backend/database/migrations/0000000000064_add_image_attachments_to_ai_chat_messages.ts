import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'ai_chat_messages'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.binary('image_data').nullable()
      table.string('image_mime_type', 32).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('image_data')
      table.dropColumn('image_mime_type')
    })
  }
}
