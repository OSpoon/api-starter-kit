import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('wecom_message_templates', (table) => {
      table.jsonb('parameters').notNullable().defaultTo('[]')
    })
  }

  async down() {
    this.schema.alterTable('wecom_message_templates', (table) => {
      table.dropColumn('parameters')
    })
  }
}
