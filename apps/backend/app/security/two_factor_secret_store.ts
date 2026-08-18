import encryption from '@adonisjs/core/services/encryption'

function tryDecrypt(value: string | null | undefined) {
  if (!value) {
    return null
  }

  try {
    return encryption.decrypt<string>(value)
  } catch {
    return value
  }
}

export function encryptTwoFactorSecret(secret: string) {
  return encryption.encrypt(secret)
}

export function decryptTwoFactorSecret(value: string | null | undefined) {
  return tryDecrypt(value)
}

export function encryptRecoveryCodes(codes: string[]) {
  return encryption.encrypt(JSON.stringify(codes))
}

export function decryptRecoveryCodes(value: string | null | undefined) {
  const decrypted = tryDecrypt(value)
  if (!decrypted) {
    return []
  }

  try {
    const codes = JSON.parse(decrypted)
    return Array.isArray(codes)
      ? codes.filter((code): code is string => typeof code === 'string')
      : []
  } catch {
    return []
  }
}
