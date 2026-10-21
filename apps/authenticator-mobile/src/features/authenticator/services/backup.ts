import type { TotpAccount } from './totp'
import { isTotpAccount } from './totp'

const FORMAT = 'project-authenticator-backup'
const VERSION = 1
const ITERATIONS = 600_000
const MAX_FILE_SIZE = 5 * 1024 * 1024
const encoder = new TextEncoder()
const decoder = new TextDecoder()

type EncryptedBackup = {
  format: typeof FORMAT
  version: typeof VERSION
  kdf: 'PBKDF2-SHA256'
  iterations: typeof ITERATIONS
  cipher: 'AES-256-GCM'
  salt: string
  iv: string
  ciphertext: string
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0)
    throw new Error('invalid backup')
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function createEncryptedBackup(
  accounts: TotpAccount[],
  passphrase: string
): Promise<string> {
  if (!/^\d{6}$/.test(passphrase) || !accounts.length || !accounts.every(isTotpAccount)) {
    throw new Error('invalid account vault')
  }

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const safeAccounts = accounts.map(({ id, issuer, name, secret, algorithm, digits, period }) => ({
    id,
    issuer,
    name,
    secret,
    algorithm,
    digits,
    period,
  }))
  const plaintext = encoder.encode(JSON.stringify({ version: VERSION, accounts: safeAccounts }))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  const backup: EncryptedBackup = {
    format: FORMAT,
    version: VERSION,
    kdf: 'PBKDF2-SHA256',
    iterations: ITERATIONS,
    cipher: 'AES-256-GCM',
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  }

  return JSON.stringify(backup)
}

export async function openEncryptedBackup(
  contents: string,
  passphrase: string
): Promise<TotpAccount[]> {
  if (contents.length > MAX_FILE_SIZE || passphrase.length > 256) throw new Error('invalid backup')

  const backup: unknown = JSON.parse(contents)
  if (!backup || typeof backup !== 'object') throw new Error('invalid backup')
  const value = backup as Partial<EncryptedBackup>
  if (
    value.format !== FORMAT ||
    value.version !== VERSION ||
    value.kdf !== 'PBKDF2-SHA256' ||
    value.iterations !== ITERATIONS ||
    value.cipher !== 'AES-256-GCM' ||
    typeof value.salt !== 'string' ||
    typeof value.iv !== 'string' ||
    typeof value.ciphertext !== 'string'
  ) {
    throw new Error('invalid backup')
  }

  const salt = fromBase64(value.salt)
  const iv = fromBase64(value.iv)
  const ciphertext = fromBase64(value.ciphertext)
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16)
    throw new Error('invalid backup')

  const key = await deriveKey(passphrase, salt)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  const payload: unknown = JSON.parse(decoder.decode(plaintext))
  if (!payload || typeof payload !== 'object') throw new Error('invalid backup')
  const restored = payload as { version?: unknown; accounts?: unknown }
  if (
    restored.version !== VERSION ||
    !Array.isArray(restored.accounts) ||
    restored.accounts.length > 10000 ||
    !restored.accounts.every(isTotpAccount)
  ) {
    throw new Error('invalid backup')
  }

  return restored.accounts.map(({ id, issuer, name, secret, algorithm, digits, period }) => ({
    id,
    issuer,
    name,
    secret,
    algorithm,
    digits,
    period,
  }))
}
