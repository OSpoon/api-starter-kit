import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('shared_throttle_buckets', (table) => {
      table.string('bucket_key', 64).primary()
      table.timestamp('window_started_at', { useTz: true }).notNullable().index()
      table.integer('request_count').notNullable()
    })
  }

  async down() {
    this.schema.dropTable('shared_throttle_buckets')
  }
}
