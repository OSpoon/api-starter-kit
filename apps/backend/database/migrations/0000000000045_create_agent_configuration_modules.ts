import { BaseSchema } from '@adonisjs/lucid/schema'

import { permissionCatalog } from '#services/permission_catalog'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('ai_agent_configurations', (table) => {
      table.integer('id').primary()
      table.jsonb('enabled_tools').notNullable().defaultTo('[]')
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })

    this.schema.createTable('ai_agent_skills', (table) => {
      table.bigIncrements('id')
      table.string('code', 64).notNullable().unique()
      table.string('name', 128).notNullable()
      table.string('description', 1024).notNullable()
      table.text('instructions').notNullable()
      table.boolean('enabled').notNullable().defaultTo(true)
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })

    this.schema.createTable('ai_agent_mcp_servers', (table) => {
      table.bigIncrements('id')
      table.string('name', 128).notNullable()
      table.string('url', 2000).notNullable()
      table.text('bearer_token').nullable()
      table.boolean('enabled').notNullable().defaultTo(false)
      table.jsonb('enabled_tools').notNullable().defaultTo('{}')
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })

    const now = new Date()
    const permissions = permissionCatalog.filter(({ code }) =>
      ['agent-config:read', 'agent-config:update', 'agent-mcp:execute'].includes(code)
    )

    for (const permission of permissions) {
      await this.db
        .table('permissions')
        .insert({
          code: permission.code,
          name: permission.name,
          group_name: permission.groupName,
          is_system: true,
          created_at: now,
        })
        .onConflict('code')
        .merge({
          name: permission.name,
          group_name: permission.groupName,
          is_system: true,
          updated_at: now,
        })
    }

    const adminRole = await this.db
      .from('roles')
      .where('code', 'super-admin')
      .select('id')
      .firstOrFail()
    const permissionRows = await this.db
      .from('permissions')
      .whereIn(
        'code',
        permissions.map(({ code }) => code)
      )
      .select('id')

    await this.db
      .table('role_permissions')
      .insert(
        permissionRows.map(({ id }) => ({
          role_id: adminRole.id,
          permission_id: id,
          created_at: now,
        }))
      )
      .onConflict(['role_id', 'permission_id'])
      .ignore()
  }

  async down() {
    const permissions = await this.db
      .from('permissions')
      .whereIn('code', ['agent-config:read', 'agent-config:update', 'agent-mcp:execute'])
      .select('id')
    const permissionIds = permissions.map(({ id }) => id)
    if (permissionIds.length) {
      await this.db.from('role_permissions').whereIn('permission_id', permissionIds).delete()
      await this.db.from('permissions').whereIn('id', permissionIds).delete()
    }

    this.schema.dropTable('ai_agent_mcp_servers')
    this.schema.dropTable('ai_agent_skills')
    this.schema.dropTable('ai_agent_configurations')
  }
}
