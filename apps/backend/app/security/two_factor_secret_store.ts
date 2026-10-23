import encryption from '@adonisjs/core/services/encryption'

export function encryptTwoFactorSecret(secret: string) {
  return encryption.encrypt(secret)
}

export function decryptTwoFactorSecret(value: string | null | undefined) {
  if (!value) return null
  const secret = encryption.decrypt<unknown>(value)
  if (typeof secret !== 'string') throw new TypeError('Invalid encrypted 2FA secret')
  return secret
}

export function encryptRecoveryCodes(codes: string[]) {
  return encryption.encrypt(JSON.stringify(codes))
}

export function decryptRecoveryCodes(value: string) {
  const decrypted = encryption.decrypt<unknown>(value)
  if (typeof decrypted !== 'string') throw new TypeError('Invalid encrypted 2FA recovery codes')
  const codes: unknown = JSON.parse(decrypted)
  if (!Array.isArray(codes) || !codes.every((code) => typeof code === 'string')) {
    throw new TypeError('Invalid encrypted 2FA recovery codes')
  }
  return codes
}
