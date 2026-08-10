import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    const permission = await this.db
      .from('permissions')
      .where('code', 'wecom-templates:upload')
      .select('id')
      .first()

    if (!permission) return

    await this.db.from('role_permissions').where('permission_id', permission.id).delete()
    await this.db.from('permissions').where('id', permission.id).delete()
  }

  async down() {}
}
