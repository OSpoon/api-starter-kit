import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('wecom_message_templates', (table) => {
      table.increments('id')
      table.string('name', 120).notNullable()
      table.text('description').nullable()
      table.string('msgtype', 32).notNullable()
      table.text('webhook_url').notNullable()
      table.jsonb('payload').notNullable()
      table.boolean('enabled').notNullable().defaultTo(true)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.index(['msgtype'])
      table.index(['enabled'])
    })
  }

  async down() {
    this.schema.dropTable('wecom_message_templates')
  }
}
