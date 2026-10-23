import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export type AiChatRole = 'user' | 'assistant'

export type AiChatCitation = {
  documentId: number
  chunkId: number
  title: string
  excerpt: string
}

export type AiChatRuntimeDetail =
  | {
      kind: 'tool'
      name: string
      state: 'running' | 'done' | 'error'
      callId?: string
      durationMs?: number
      phase?: string
      errorCode?: string
      detail?: Record<string, unknown>
    }
  | { kind: 'plan'; steps: Array<Record<string, unknown>> }
  | {
      kind: 'run'
      durationMs: number
      usage: Record<string, unknown>
    }
  | {
      kind: 'confirmation'
      action: string
      targetLabel?: string
      status: 'confirmed' | 'failed' | 'expired'
      completedAt: string
    }

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isCitation(value: unknown): value is AiChatCitation {
  return (
    isJsonRecord(value) &&
    typeof value.documentId === 'number' &&
    typeof value.chunkId === 'number' &&
    typeof value.title === 'string' &&
    typeof value.excerpt === 'string'
  )
}

function isRuntimeDetail(value: unknown): value is AiChatRuntimeDetail {
  if (!isJsonRecord(value)) return false
  if (value.kind === 'tool') {
    return (
      typeof value.name === 'string' &&
      ['running', 'done', 'error'].includes(value.state as string) &&
      (value.callId === undefined || typeof value.callId === 'string') &&
      (value.durationMs === undefined || typeof value.durationMs === 'number') &&
      (value.phase === undefined || typeof value.phase === 'string') &&
      (value.errorCode === undefined || typeof value.errorCode === 'string') &&
      (value.detail === undefined || isJsonRecord(value.detail))
    )
  }
  if (value.kind === 'plan') {
    return Array.isArray(value.steps) && value.steps.every(isJsonRecord)
  }
  if (value.kind === 'run') {
    return typeof value.durationMs === 'number' && isJsonRecord(value.usage)
  }
  return (
    value.kind === 'confirmation' &&
    typeof value.action === 'string' &&
    (value.targetLabel === undefined || typeof value.targetLabel === 'string') &&
    ['confirmed', 'failed', 'expired'].includes(value.status as string) &&
    typeof value.completedAt === 'string'
  )
}

function consumeJsonArray<T>(
  value: unknown,
  columnName: string,
  isItemValid: (item: unknown) => item is T
): T[] {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value
  if (!Array.isArray(parsed) || !parsed.every(isItemValid)) {
    throw new TypeError(`Invalid JSON array in ai_chat_messages.${columnName}`)
  }
  return parsed
}

export default class AiChatMessage extends BaseModel {
  static table = 'ai_chat_messages'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare conversationId: number

  @column()
  declare role: AiChatRole

  @column()
  declare content: string

  @column({
    prepare: (citations: AiChatCitation[] | null | undefined) => JSON.stringify(citations ?? []),
    consume: (value: unknown) => consumeJsonArray(value, 'citations', isCitation),
  })
  declare citations: AiChatCitation[]

  @column({
    prepare: (details: AiChatRuntimeDetail[] | null | undefined) => JSON.stringify(details ?? []),
    consume: (value: unknown) => consumeJsonArray(value, 'runtime_details', isRuntimeDetail),
  })
  declare runtimeDetails: AiChatRuntimeDetail[]

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
