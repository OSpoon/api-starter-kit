import type { TotpAccount, TotpAlgorithm } from './totp'
import { isValidSecret, parseOtpAuthUri } from './totp'

export type MigrationAccount = Omit<TotpAccount, 'id'>

export type MigrationPart = {
  batchId: string
  batchIndex: number
  batchSize: number
  accounts: MigrationAccount[]
  skippedCount: number
}

export type MigrationCollection = {
  accounts: MigrationAccount[]
  skippedCount: number
  incomplete: { received: number; expected: number } | null
}

class ProtoReader {
  private offset = 0

  constructor(private readonly bytes: Uint8Array) {}

  get done(): boolean {
    return this.offset >= this.bytes.length
  }

  readVarint(): number {
    let result = 0n
    let shift = 0n
    for (let index = 0; index < 10; index += 1) {
      if (this.offset >= this.bytes.length) throw new Error('invalid migration QR')
      const byte = this.bytes[this.offset++]!
      result |= BigInt(byte & 0x7f) << shift
      if ((byte & 0x80) === 0) {
        if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('invalid migration QR')
        return Number(result)
      }
      shift += 7n
    }
    throw new Error('invalid migration QR')
  }

  readBytes(): Uint8Array {
    const length = this.readVarint()
    const end = this.offset + length
    if (length > this.bytes.length || end > this.bytes.length)
      throw new Error('invalid migration QR')
    const value = this.bytes.subarray(this.offset, end)
    this.offset = end
    return value
  }

  skip(wireType: number): void {
    if (wireType === 0) {
      this.readVarint()
      return
    }
    if (wireType === 1) {
      this.offset += 8
    } else if (wireType === 2) {
      this.offset += this.readVarint()
    } else if (wireType === 5) {
      this.offset += 4
    } else {
      throw new Error('invalid migration QR')
    }
    if (this.offset > this.bytes.length) throw new Error('invalid migration QR')
  }
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function encodeBase32(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let buffer = 0
  let bits = 0
  let output = ''
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      output += alphabet[(buffer >> bits) & 31]
      buffer &= (1 << bits) - 1
    }
  }
  if (bits > 0) output += alphabet[(buffer << (5 - bits)) & 31]
  return output
}

function parseMigrationAccount(bytes: Uint8Array): {
  account: MigrationAccount | null
  skipped: boolean
} {
  const reader = new ProtoReader(bytes)
  let secret: Uint8Array<ArrayBufferLike> = new Uint8Array()
  let name = ''
  let issuer = ''
  let algorithm = 0
  let digits = 0
  let type = 0

  while (!reader.done) {
    const tag = reader.readVarint()
    const field = tag >>> 3
    const wireType = tag & 7
    if (!field) throw new Error('invalid migration QR')
    if (wireType === 2 && field === 1) secret = reader.readBytes()
    else if (wireType === 2 && field === 2) name = new TextDecoder().decode(reader.readBytes())
    else if (wireType === 2 && field === 3) issuer = new TextDecoder().decode(reader.readBytes())
    else if (wireType === 0 && (field === 4 || field === 5 || field === 6)) {
      const value = reader.readVarint()
      if (field === 4) algorithm = value
      if (field === 5) digits = value
      if (field === 6) type = value
    } else reader.skip(wireType)
  }

  const algorithmMap: Record<number, TotpAlgorithm> = {
    0: 'SHA1',
    1: 'SHA1',
    2: 'SHA256',
    3: 'SHA512',
  }
  const accountAlgorithm = algorithmMap[algorithm]
  const digitCount = digits === 2 ? 8 : 6
  if (type !== 0 && type !== 2) return { account: null, skipped: true }
  if (
    !secret.length ||
    !name ||
    !accountAlgorithm ||
    (digits !== 0 && digits !== 1 && digits !== 2)
  ) {
    return { account: null, skipped: true }
  }

  const labelSeparator = name.indexOf(':')
  const labelIssuer = labelSeparator < 0 ? '' : name.slice(0, labelSeparator).trim()
  const accountName = (labelSeparator < 0 ? name : name.slice(labelSeparator + 1)).trim()
  const normalizedSecret = encodeBase32(secret)
  if (
    !accountName ||
    accountName.length > 120 ||
    (issuer.trim() || labelIssuer || accountName).length > 80 ||
    !isValidSecret(normalizedSecret)
  ) {
    return { account: null, skipped: true }
  }

  return {
    account: {
      issuer: issuer.trim() || labelIssuer || accountName,
      name: accountName,
      secret: normalizedSecret,
      algorithm: accountAlgorithm,
      digits: digitCount as 6 | 8,
      period: 30,
    },
    skipped: false,
  }
}

export function parseMigrationUri(uri: string): MigrationPart {
  if (uri.length > 1_000_000) throw new Error('invalid migration QR')
  const parsed = new URL(uri.trim())
  if (parsed.protocol !== 'otpauth-migration:' || parsed.hostname !== 'offline') {
    throw new Error('unsupported migration QR')
  }
  const data = parsed.searchParams.get('data')?.replaceAll(' ', '+')
  if (!data) throw new Error('invalid migration QR')
  const reader = new ProtoReader(decodeBase64Url(data))
  const accounts: MigrationAccount[] = []
  let batchSize = 1
  let batchIndex = 0
  let batchId = ''
  let skippedCount = 0

  while (!reader.done) {
    const tag = reader.readVarint()
    const field = tag >>> 3
    const wireType = tag & 7
    if (!field) throw new Error('invalid migration QR')
    if (field === 1 && wireType === 2) {
      const result = parseMigrationAccount(reader.readBytes())
      if (result.account) accounts.push(result.account)
      else skippedCount += 1
    } else if ((field === 3 || field === 4) && wireType === 0) {
      const value = reader.readVarint()
      if (field === 3) batchSize = value
      else batchIndex = value
    } else if (field === 5 && wireType === 2) {
      batchId = Array.from(reader.readBytes(), (byte) => byte.toString(16).padStart(2, '0')).join(
        ''
      )
    } else reader.skip(wireType)
  }

  if (
    batchSize < 1 ||
    batchSize > 100 ||
    batchIndex < 0 ||
    batchIndex >= batchSize ||
    (batchSize > 1 && !batchId)
  ) {
    throw new Error('invalid migration QR')
  }

  return { batchId: batchId || crypto.randomUUID(), batchIndex, batchSize, accounts, skippedCount }
}

export function parseTransferQr(uri: string): MigrationPart {
  if (uri.startsWith('otpauth-migration:')) return parseMigrationUri(uri)
  const account = parseOtpAuthUri(uri)
  return {
    batchId: crypto.randomUUID(),
    batchIndex: 0,
    batchSize: 1,
    accounts: [account],
    skippedCount: 0,
  }
}

export function collectMigrationParts(parts: MigrationPart[]): MigrationCollection {
  const batches = new Map<string, Map<number, MigrationPart>>()
  for (const part of parts) {
    const batch = batches.get(part.batchId) ?? new Map<number, MigrationPart>()
    if (batch.size && [...batch.values()][0]!.batchSize !== part.batchSize)
      throw new Error('invalid migration QR')
    batch.set(part.batchIndex, part)
    batches.set(part.batchId, batch)
  }

  const result: MigrationCollection = { accounts: [], skippedCount: 0, incomplete: null }
  for (const batch of batches.values()) {
    const expected = [...batch.values()][0]!.batchSize
    if (batch.size < expected) {
      result.incomplete = {
        received: Math.min(expected, (result.incomplete?.received ?? 0) + batch.size),
        expected: (result.incomplete?.expected ?? 0) + expected,
      }
      continue
    }
    for (const part of batch.values()) {
      result.accounts.push(...part.accounts)
      result.skippedCount += part.skippedCount
    }
  }
  return result
}
