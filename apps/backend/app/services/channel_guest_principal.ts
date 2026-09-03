import User from '#models/user'

export const CHANNEL_GUEST_USER_EMAIL = 'channel-guest@internal.invalid'
export const CHANNEL_GUEST_ROLE_CODE = 'channel-guest'

export function isChannelGuestUser(user: Pick<User, 'email'>) {
  return user.email === CHANNEL_GUEST_USER_EMAIL
}

export async function getChannelGuestUser() {
  const user = await User.findBy('email', CHANNEL_GUEST_USER_EMAIL)
  if (!user) throw new Error('群聊访客主体未初始化，请先执行数据库迁移')
  return user
}
