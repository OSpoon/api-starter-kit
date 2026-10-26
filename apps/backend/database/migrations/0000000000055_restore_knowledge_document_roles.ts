import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('knowledge_document_roles', (table) => {
      table
        .bigInteger('document_id')
        .notNullable()
        .references('id')
        .inTable('knowledge_documents')
        .onDelete('CASCADE')
      table.integer('role_id').notNullable().references('id').inTable('roles').onDelete('RESTRICT')
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.primary(['document_id', 'role_id'])
      table.index(['role_id', 'document_id'])
    })
  }

  async down() {
    this.schema.dropTable('knowledge_document_roles')
  }
}
