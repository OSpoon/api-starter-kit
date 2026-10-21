export type TotpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512'

export type TotpAccount = {
  id: string
  issuer: string
  name: string
  secret: string
  algorithm: TotpAlgorithm
  digits: 6 | 8
  period: number
}

export function isTotpAccount(value: unknown): value is TotpAccount {
  if (!value || typeof value !== 'object') return false
  const account = value as Partial<TotpAccount>
  return (
    typeof account.id === 'string' &&
    typeof account.issuer === 'string' &&
    typeof account.name === 'string' &&
    typeof account.secret === 'string' &&
    isValidSecret(account.secret) &&
    (account.algorithm === 'SHA1' ||
      account.algorithm === 'SHA256' ||
      account.algorithm === 'SHA512') &&
    (account.digits === 6 || account.digits === 8) &&
    Number.isInteger(account.period) &&
    account.period! > 0 &&
    account.period! <= 86400
  )
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const HASHES: Record<TotpAlgorithm, string> = {
  SHA1: 'SHA-1',
  SHA256: 'SHA-256',
  SHA512: 'SHA-512',
}

export function normalizeSecret(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '')
}

export function decodeBase32(value: string): Uint8Array<ArrayBuffer> {
  const secret = normalizeSecret(value)
  let buffer = 0
  let bits = 0
  const bytes: number[] = []

  for (const character of secret) {
    const digit = BASE32.indexOf(character)
    if (digit < 0) throw new Error('invalid secret')
    buffer = (buffer << 5) | digit
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xff)
      buffer &= (1 << bits) - 1
    }
  }

  if (bytes.length === 0 || (bits > 0 && (buffer & ((1 << bits) - 1)) !== 0)) {
    throw new Error('invalid secret')
  }

  return new Uint8Array(bytes)
}

export function isValidSecret(value: string): boolean {
  try {
    decodeBase32(value)
    return true
  } catch {
    return false
  }
}

export function parseOtpAuthUri(uri: string): Omit<TotpAccount, 'id'> {
  const parsed = new URL(uri.trim())
  if (parsed.protocol !== 'otpauth:' || parsed.hostname.toLowerCase() !== 'totp') {
    throw new Error('unsupported uri')
  }

  const label = decodeURIComponent(parsed.pathname.slice(1))
  const separator = label.indexOf(':')
  const labelIssuer = separator < 0 ? '' : label.slice(0, separator).trim()
  const name = (separator < 0 ? label : label.slice(separator + 1)).trim()
  const issuer = (parsed.searchParams.get('issuer') || labelIssuer).trim()
  const secret = normalizeSecret(parsed.searchParams.get('secret') || '')
  const algorithm = (parsed.searchParams.get('algorithm') || 'SHA1').toUpperCase()
  const digits = Number(parsed.searchParams.get('digits') || 6)
  const period = Number(parsed.searchParams.get('period') || 30)

  if (!name || !isValidSecret(secret)) throw new Error('invalid setup uri')
  if (!Object.hasOwn(HASHES, algorithm)) throw new Error('unsupported algorithm')
  if (digits !== 6 && digits !== 8) throw new Error('unsupported digits')
  if (!Number.isInteger(period) || period < 1 || period > 86400) throw new Error('invalid period')

  return {
    issuer,
    name,
    secret,
    algorithm: algorithm as TotpAlgorithm,
    digits: digits as 6 | 8,
    period,
  }
}

export async function generateTotpCode(
  account: TotpAccount,
  timestamp = Date.now()
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    decodeBase32(account.secret),
    { name: 'HMAC', hash: HASHES[account.algorithm] },
    false,
    ['sign']
  )
  const counter = BigInt(Math.floor(timestamp / 1000 / account.period))
  const message = new Uint8Array(8)
  let remaining = counter
  for (let index = message.length - 1; index >= 0; index -= 1) {
    message[index] = Number(remaining & 0xffn)
    remaining >>= 8n
  }

  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, message))
  const offset = digest[digest.length - 1]! & 0x0f
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!

  return String((binary >>> 0) % 10 ** account.digits).padStart(account.digits, '0')
}
