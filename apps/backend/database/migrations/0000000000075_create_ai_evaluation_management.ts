import { BaseSchema } from '@adonisjs/lucid/schema'

import { permissionCatalog } from '#services/permission_catalog'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('ai_evaluation_cases', (table) => {
      table.increments('id')
      table
        .integer('source_conversation_id')
        .unsigned()
        .nullable()
        .references('ai_chat_conversations.id')
        .onDelete('SET NULL')
      table.jsonb('source_message_ids').notNullable().defaultTo('[]')
      table.jsonb('conversation_messages').notNullable().defaultTo('[]')
      table.string('name', 200).notNullable()
      table.text('question').notNullable()
      table.text('reference_answer').notNullable()
      table.jsonb('expected_tools').notNullable().defaultTo('[]')
      table.jsonb('expected_tool_sequence').notNullable().defaultTo('[]')
      table.jsonb('required_terms').notNullable().defaultTo('[]')
      table.jsonb('forbidden_terms').notNullable().defaultTo('[]')
      table.jsonb('mock_tool_outputs').notNullable().defaultTo('{}')
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
      table.index(['updated_at'])
    })

    this.schema.createTable('ai_evaluation_runs', (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
      table.string('status', 20).notNullable().defaultTo('queued')
      table.string('model_id', 200).notNullable()
      table.integer('total_cases').unsigned().notNullable()
      table.integer('completed_cases').unsigned().notNullable().defaultTo(0)
      table.jsonb('case_ids').notNullable().defaultTo('[]')
      table.integer('score').unsigned().nullable()
      table.jsonb('results').notNullable().defaultTo('[]')
      table.text('error').nullable()
      table.timestamp('started_at', { useTz: true }).nullable()
      table.timestamp('completed_at', { useTz: true }).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
      table.index(['created_at'])
    })

    const now = new Date()
    const evaluationPermissions = permissionCatalog.filter(({ code }) =>
      ['ai-evaluations:read', 'ai-evaluations:manage', 'ai-evaluations:run'].includes(code)
    )

    for (const permission of evaluationPermissions) {
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

    const superAdmin = await this.db
      .from('roles')
      .where('code', 'super-admin')
      .select('id')
      .firstOrFail()
    const permissionRows = await this.db
      .from('permissions')
      .whereIn(
        'code',
        evaluationPermissions.map(({ code }) => code)
      )
      .select('id')
    await this.db
      .table('role_permissions')
      .insert(
        permissionRows.map(({ id }) => ({
          role_id: superAdmin.id,
          permission_id: id,
          created_at: now,
        }))
      )
      .onConflict(['role_id', 'permission_id'])
      .ignore()
  }

  async down() {
    const rows = await this.db
      .from('permissions')
      .whereIn('code', ['ai-evaluations:read', 'ai-evaluations:manage', 'ai-evaluations:run'])
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
    this.schema.dropTable('ai_evaluation_runs')
    this.schema.dropTable('ai_evaluation_cases')
  }
}
