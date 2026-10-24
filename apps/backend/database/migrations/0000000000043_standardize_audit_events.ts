import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'audit_logs'

  async up() {
    await this.db.rawQuery(`
      ALTER TABLE ${this.tableName}
        ADD COLUMN IF NOT EXISTS event_version SMALLINT NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS actor_type VARCHAR(24) NOT NULL DEFAULT 'unknown',
        ADD COLUMN IF NOT EXISTS source VARCHAR(24) NOT NULL DEFAULT 'legacy',
        ADD COLUMN IF NOT EXISTS outcome VARCHAR(24) NOT NULL DEFAULT 'unknown',
        ADD COLUMN IF NOT EXISTS reason_code VARCHAR(120),
        ADD COLUMN IF NOT EXISTS trace_id VARCHAR(120),
        ADD COLUMN IF NOT EXISTS request_method VARCHAR(12),
        ADD COLUMN IF NOT EXISTS request_route VARCHAR(512)
    `)

    await this.db.from(this.tableName).whereNotNull('actor_user_id').update({ actor_type: 'user' })

    await this.db.rawQuery(
      'CREATE INDEX IF NOT EXISTS audit_logs_source_outcome_created_at_index ON audit_logs(source, outcome, created_at)'
    )
    await this.db.rawQuery(
      'CREATE INDEX IF NOT EXISTS audit_logs_trace_id_index ON audit_logs(trace_id)'
    )
  }

  async down() {
    await this.db.rawQuery('DROP INDEX IF EXISTS audit_logs_source_outcome_created_at_index')
    await this.db.rawQuery('DROP INDEX IF EXISTS audit_logs_trace_id_index')
    await this.db.rawQuery(`
      ALTER TABLE ${this.tableName}
        DROP COLUMN IF EXISTS event_version,
        DROP COLUMN IF EXISTS actor_type,
        DROP COLUMN IF EXISTS source,
        DROP COLUMN IF EXISTS outcome,
        DROP COLUMN IF EXISTS reason_code,
        DROP COLUMN IF EXISTS trace_id,
        DROP COLUMN IF EXISTS request_method,
        DROP COLUMN IF EXISTS request_route
    `)
  }
}
