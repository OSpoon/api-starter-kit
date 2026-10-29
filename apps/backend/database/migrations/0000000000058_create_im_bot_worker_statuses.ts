import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('im_bot_worker_statuses', (table) => {
      table.string('channel', 16).primary()
      table.integer('pid').notNullable()
      table.string('worker_status', 16).notNullable()
      table.timestamp('started_at', { useTz: true }).notNullable()
      table.timestamp('last_heartbeat_at', { useTz: true }).notNullable()
    })
  }

  async down() {
    this.schema.dropTable('im_bot_worker_statuses')
  }
}
