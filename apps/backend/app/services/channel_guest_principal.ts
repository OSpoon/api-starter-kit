import User from '#models/user'

export const CHANNEL_GUEST_USER_EMAIL = 'channel-guest@internal.invalid'
export const CHANNEL_GUEST_ROLE_CODE = 'channel-guest'
export const AI_INTEGRATION_USER_EMAIL = 'ai-integration@internal.invalid'

export function isChannelGuestUser(user: Pick<User, 'email'>) {
  return user.email === CHANNEL_GUEST_USER_EMAIL
}

export function isInternalUser(user: Pick<User, 'email'>) {
  return isChannelGuestUser(user) || user.email === AI_INTEGRATION_USER_EMAIL
}

export async function getChannelGuestUser() {
  const user = await User.findBy('email', CHANNEL_GUEST_USER_EMAIL)
  if (!user) throw new Error('群聊访客主体未初始化，请先执行数据库迁移')
  return user
}

export async function getAiIntegrationUser() {
  const user = await User.findBy('email', AI_INTEGRATION_USER_EMAIL)
  if (!user) throw new Error('AI API 集成主体未初始化，请先执行数据库迁移')
  return user
}
