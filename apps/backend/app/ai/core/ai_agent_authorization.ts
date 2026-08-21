import { Bouncer } from '@adonisjs/bouncer'

import { access } from '#abilities/main'
import type { PermissionCode } from '#authorization/permission_catalog'
import User from '#models/user'

export async function ensureAiAgentPermission(
  userId: number,
  permission: PermissionCode,
  deniedMessage = '当前账号没有执行此操作的权限'
) {
  const user = await User.findOrFail(userId)
  const bouncer = new Bouncer(() => user, { access })
  if (!(await bouncer.allows('access', permission))) throw new Error(deniedMessage)
  return user
}
