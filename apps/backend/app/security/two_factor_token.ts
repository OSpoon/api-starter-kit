import encryption from '@adonisjs/core/services/encryption'

interface TwoFactorPendingPayload {
  userId: number
  type: '2fa_pending'
  timestamp: number
}

export function createTwoFactorTempToken(userId: number) {
  const payload: TwoFactorPendingPayload = {
    userId,
    type: '2fa_pending',
    timestamp: Date.now(),
  }

  return encryption.encrypt(payload, '5m')
}

export function parseTwoFactorTempToken(tempToken: string) {
  const payload = encryption.decrypt<TwoFactorPendingPayload | null>(tempToken)

  if (!payload || payload.type !== '2fa_pending' || !payload.userId) {
    return null
  }

  return payload
}
