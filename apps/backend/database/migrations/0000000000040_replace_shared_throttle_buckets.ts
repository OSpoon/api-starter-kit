import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'rate_limits'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('key', 255).notNullable().primary()
      table.integer('points', 9).notNullable().defaultTo(0)
      table.bigint('expire').unsigned()
    })
    // Rate-limit counters are transient; the official limiter uses a new key format.
    this.schema.dropTable('shared_throttle_buckets')
  }

  async down() {
    this.schema.createTable('shared_throttle_buckets', (table) => {
      table.string('bucket_key', 64).primary()
      table.timestamp('window_started_at', { useTz: true }).notNullable().index()
      table.integer('request_count').notNullable()
    })
    this.schema.dropTable(this.tableName)
  }
}
