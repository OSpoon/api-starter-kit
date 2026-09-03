import crypto from 'node:crypto'

import hash from '@adonisjs/core/services/hash'
import { BaseSchema } from '@adonisjs/lucid/schema'

const guestRoleCode = 'channel-guest'
const guestEmail = 'channel-guest@internal.invalid'

export default class extends BaseSchema {
  async up() {
    const now = new Date()
    await this.db
      .table('roles')
      .insert({
        code: guestRoleCode,
        name: '渠道访客',
        description: '仅用于群聊访客知识库问答的内部主体',
        is_system: true,
        created_at: now,
      })
      .onConflict('code')
      .merge({
        name: '渠道访客',
        description: '仅用于群聊访客知识库问答的内部主体',
        is_system: true,
        updated_at: now,
      })

    const role = await this.db.from('roles').where('code', guestRoleCode).select('id').firstOrFail()
    const permission = await this.db
      .from('permissions')
      .where('code', 'knowledge:read')
      .select('id')
      .firstOrFail()

    await this.db
      .table('role_permissions')
      .insert({ role_id: role.id, permission_id: permission.id, created_at: now })
      .onConflict(['role_id', 'permission_id'])
      .ignore()

    let user = await this.db.from('users').where('email', guestEmail).select('id').first()
    if (!user) {
      const password = await hash.make(crypto.randomBytes(32).toString('base64url'))
      await this.db.table('users').insert({
        full_name: '渠道访客主体',
        email: guestEmail,
        password,
        disabled_at: now,
        created_at: now,
      })
      user = await this.db.from('users').where('email', guestEmail).select('id').firstOrFail()
    } else {
      await this.db.from('users').where('id', user.id).update({ disabled_at: now, updated_at: now })
    }

    await this.db
      .table('user_roles')
      .insert({ user_id: user.id, role_id: role.id, created_at: now })
      .onConflict(['user_id', 'role_id'])
      .ignore()
  }

  async down() {
    const user = await this.db.from('users').where('email', guestEmail).select('id').first()
    const role = await this.db.from('roles').where('code', guestRoleCode).select('id').first()
    if (user) await this.db.from('user_roles').where('user_id', user.id).delete()
    if (user) await this.db.from('users').where('id', user.id).delete()
    if (role) await this.db.from('role_permissions').where('role_id', role.id).delete()
    if (role) await this.db.from('roles').where('id', role.id).delete()
  }
}
