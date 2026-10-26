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
      startedAt?: number
      displayName?: string
      durationMs?: number
      message?: string
      phase?: string
      errorCode?: string
      detail?: Record<string, unknown>
    }
  | {
      kind: 'phase'
      name: 'preparing_agent' | 'mcp_discovery' | 'model_response'
      state: 'running' | 'done' | 'error'
      callId: string
      startedAt: number
      durationMs?: number
      serverName?: string
      toolCount?: number
      tools?: Array<{ name: string; mode?: 'read' | 'confirm' }>
    }
  | { kind: 'plan'; turn?: number; steps: Array<Record<string, unknown>> }
  | {
      kind: 'run'
      durationMs: number
      usage: Record<string, unknown>
    }
  | {
      kind: 'confirmation'
      action: string
      targetLabel?: string
      status: 'confirmed' | 'failed' | 'expired' | 'cancelled'
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
      (value.startedAt === undefined || typeof value.startedAt === 'number') &&
      (value.displayName === undefined || typeof value.displayName === 'string') &&
      (value.durationMs === undefined || typeof value.durationMs === 'number') &&
      (value.message === undefined || typeof value.message === 'string') &&
      (value.phase === undefined || typeof value.phase === 'string') &&
      (value.errorCode === undefined || typeof value.errorCode === 'string') &&
      (value.detail === undefined || isJsonRecord(value.detail))
    )
  }
  if (value.kind === 'plan') {
    return (
      (value.turn === undefined || (Number.isInteger(value.turn) && (value.turn as number) > 0)) &&
      Array.isArray(value.steps) &&
      value.steps.every(isJsonRecord)
    )
  }
  if (value.kind === 'phase') {
    return (
      ['preparing_agent', 'mcp_discovery', 'model_response'].includes(value.name as string) &&
      ['running', 'done', 'error'].includes(value.state as string) &&
      typeof value.callId === 'string' &&
      typeof value.startedAt === 'number' &&
      (value.durationMs === undefined || typeof value.durationMs === 'number') &&
      (value.serverName === undefined || typeof value.serverName === 'string') &&
      (value.toolCount === undefined ||
        (typeof value.toolCount === 'number' && value.toolCount >= 0)) &&
      (value.tools === undefined ||
        (Array.isArray(value.tools) &&
          value.tools.every(
            (tool) =>
              isJsonRecord(tool) &&
              typeof tool.name === 'string' &&
              (tool.mode === undefined || ['read', 'confirm'].includes(tool.mode as string))
          )))
    )
  }
  if (value.kind === 'run') {
    return typeof value.durationMs === 'number' && isJsonRecord(value.usage)
  }
  return (
    value.kind === 'confirmation' &&
    typeof value.action === 'string' &&
    (value.targetLabel === undefined || typeof value.targetLabel === 'string') &&
    ['confirmed', 'failed', 'expired', 'cancelled'].includes(value.status as string) &&
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
