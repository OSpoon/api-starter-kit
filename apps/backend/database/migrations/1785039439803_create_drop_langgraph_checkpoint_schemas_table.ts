import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    await this.schema.raw('DROP SCHEMA IF EXISTS langgraph CASCADE')
  }

  async down() {
    await this.schema.raw('CREATE SCHEMA IF NOT EXISTS langgraph')
  }
}
