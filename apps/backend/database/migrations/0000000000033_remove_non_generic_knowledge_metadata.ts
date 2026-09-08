import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'knowledge_documents'

  async up() {
    await this.db.rawQuery(`
      ALTER TABLE ${this.tableName}
        DROP COLUMN IF EXISTS subject,
        DROP COLUMN IF EXISTS document_type,
        DROP COLUMN IF EXISTS source_name
    `)
  }

  async down() {
    await this.db.rawQuery(`
      ALTER TABLE ${this.tableName}
        ADD COLUMN IF NOT EXISTS source_name VARCHAR(200),
        ADD COLUMN IF NOT EXISTS document_type VARCHAR(120),
        ADD COLUMN IF NOT EXISTS subject VARCHAR(200)
    `)
  }
}
