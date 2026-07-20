import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    if (!(await this.schema.hasTable('api_keys'))) {
      return
    }

    if (!(await this.schema.hasColumn('api_keys', 'key_encrypted'))) {
      return
    }

    this.schema.alterTable('api_keys', (table) => {
      table.dropColumn('key_encrypted')
    })
  }

  async down() {
    if (!(await this.schema.hasTable('api_keys'))) {
      return
    }

    if (await this.schema.hasColumn('api_keys', 'key_encrypted')) {
      return
    }

    this.schema.alterTable('api_keys', (table) => {
      table.text('key_encrypted').nullable()
    })
  }
}
