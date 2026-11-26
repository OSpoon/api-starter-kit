import { BaseSchema } from '@adonisjs/lucid/schema'

import { permissionCatalog } from '#services/permission_catalog'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('ai_automations', (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
      table.string('name', 120).notNullable()
      table.text('prompt').notNullable()
      table.string('schedule_kind', 20).notNullable()
      table.timestamp('schedule_at', { useTz: true }).nullable()
      table.string('schedule_time', 5).nullable()
      table.integer('schedule_weekday').nullable()
      table.string('timezone', 100).notNullable()
      table.timestamp('next_run_at', { useTz: true }).nullable()
      table.boolean('enabled').notNullable().defaultTo(true)
      table.text('encrypted_webhook_url').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
      table.timestamp('deleted_at', { useTz: true }).nullable()
      table.index(['enabled', 'next_run_at'])
      table.index(['user_id', 'updated_at'])
      table.index(['user_id', 'deleted_at'])
    })

    this.schema.createTable('ai_automation_runs', (table) => {
      table.increments('id')
      table
        .integer('automation_id')
        .unsigned()
        .nullable()
        .references('ai_automations.id')
        .onDelete('SET NULL')
      table.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
      table.string('automation_name', 120).notNullable()
      table.string('trigger_kind', 20).notNullable()
      table.string('status', 20).notNullable().defaultTo('queued')
      table.timestamp('scheduled_for', { useTz: true }).notNullable()
      table.timestamp('started_at', { useTz: true }).nullable()
      table.timestamp('heartbeat_at', { useTz: true }).nullable()
      table.timestamp('completed_at', { useTz: true }).nullable()
      table.integer('attempt_count').unsigned().notNullable().defaultTo(0)
      table.text('summary').nullable()
      table.text('error').nullable()
      table.jsonb('delivery_results').notNullable().defaultTo('{}')
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
      table.index(['status', 'scheduled_for'])
      table.index(['automation_id', 'created_at'])
      table.index(['automation_id', 'status'])
    })

    this.schema.alterTable('ai_chat_conversations', (table) => {
      table
        .integer('automation_run_id')
        .unsigned()
        .nullable()
        .references('ai_automation_runs.id')
        .onDelete('SET NULL')
      table.unique(['automation_run_id'])
    })

    const permissions = permissionCatalog.filter(({ code }) =>
      ['ai-automations:read', 'ai-automations:manage', 'ai-automations:run'].includes(code)
    )
    const now = new Date()
    for (const permission of permissions) {
      await this.db
        .table('permissions')
        .insert({
          code: permission.code,
          name: permission.name,
          group_name: permission.groupName,
          is_system: true,
          created_at: now,
          updated_at: now,
        })
        .onConflict('code')
        .merge({
          name: permission.name,
          group_name: permission.groupName,
          is_system: true,
          updated_at: now,
        })
    }
    const roles = await this.db.from('roles').whereIn('code', ['admin', 'super-admin']).select('id')
    const permissionRows = await this.db
      .from('permissions')
      .whereIn(
        'code',
        permissions.map(({ code }) => code)
      )
      .select('id')
    if (roles.length) {
      await this.db
        .table('role_permissions')
        .insert(
          roles.flatMap((role) =>
            permissionRows.map(({ id }) => ({
              role_id: role.id,
              permission_id: id,
              created_at: now,
            }))
          )
        )
        .onConflict(['role_id', 'permission_id'])
        .ignore()
    }
  }

  async down() {
    this.schema.alterTable('ai_chat_conversations', (table) => {
      table.dropColumn('automation_run_id')
    })
    const rows = await this.db
      .from('permissions')
      .whereIn('code', ['ai-automations:read', 'ai-automations:manage', 'ai-automations:run'])
      .select('id')
    if (rows.length) {
      await this.db
        .from('role_permissions')
        .whereIn(
          'permission_id',
          rows.map(({ id }) => id)
        )
        .delete()
      await this.db
        .from('permissions')
        .whereIn(
          'id',
          rows.map(({ id }) => id)
        )
        .delete()
    }
    this.schema.dropTable('ai_automation_runs')
    this.schema.dropTable('ai_automations')
  }
}
