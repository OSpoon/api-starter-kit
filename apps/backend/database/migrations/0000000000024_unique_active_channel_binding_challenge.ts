import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.raw(`
      CREATE UNIQUE INDEX channel_binding_challenges_active_identity_unique
      ON channel_binding_challenges (channel, external_tenant_id, external_user_id)
      WHERE used_at IS NULL
    `)
  }

  async down() {
    this.schema.raw('DROP INDEX IF EXISTS channel_binding_challenges_active_identity_unique')
  }
}
