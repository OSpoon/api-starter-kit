import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('knowledge_documents', (table) => {
      table.boolean('enabled').notNullable().defaultTo(true)
      table.index(['enabled'])
    })
    this.schema.dropTableIfExists('knowledge_document_roles')
  }

  async down() {
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
    this.schema.alterTable('knowledge_documents', (table) => {
      table.dropIndex(['enabled'])
      table.dropColumn('enabled')
    })
  }
}
