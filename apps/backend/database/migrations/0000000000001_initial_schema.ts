import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    // Legacy baseline migration kept for databases created before migrations were split.
  }

  async down() {
    // No-op: the split migrations own the concrete schema changes.
  }
}
