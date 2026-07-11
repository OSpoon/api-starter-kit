import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('roles', (table) => {
      table.increments('id').notNullable()
      table.string('code', 100).notNullable().unique()
      table.string('name', 120).notNullable()
      table.text('description').nullable()
      table.boolean('is_system').notNullable().defaultTo(false)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })

    this.schema.createTable('permissions', (table) => {
      table.increments('id').notNullable()
      table.string('code', 100).notNullable().unique()
      table.string('name', 120).notNullable()
      table.string('group_name', 120).notNullable()
      table.text('description').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })

    this.schema.createTable('user_roles', (table) => {
      table.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
      table.integer('role_id').unsigned().notNullable().references('roles.id').onDelete('CASCADE')
      table.timestamp('created_at').notNullable()
      table.primary(['user_id', 'role_id'])
    })

    this.schema.createTable('role_permissions', (table) => {
      table.integer('role_id').unsigned().notNullable().references('roles.id').onDelete('CASCADE')
      table
        .integer('permission_id')
        .unsigned()
        .notNullable()
        .references('permissions.id')
        .onDelete('CASCADE')
      table.timestamp('created_at').notNullable()
      table.primary(['role_id', 'permission_id'])
    })
  }

  async down() {
    this.schema.dropTableIfExists('role_permissions')
    this.schema.dropTableIfExists('user_roles')
    this.schema.dropTableIfExists('permissions')
    this.schema.dropTableIfExists('roles')
  }
}
