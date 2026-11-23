import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export type AiEvaluationConversationMessage = {
  role: 'user' | 'assistant'
  content: string
}

function prepareJson(value: unknown) {
  return JSON.stringify(value)
}

function consumeJson<T>(value: unknown, fallback: T): T {
  if (typeof value === 'string') return JSON.parse(value) as T
  return (value ?? fallback) as T
}

export default class AiEvaluationCase extends BaseModel {
  static table = 'ai_evaluation_cases'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare sourceConversationId: number | null

  @column({
    prepare: (value: number[] | null | undefined) => prepareJson(value ?? []),
    consume: (value: unknown) => consumeJson(value, [] as number[]),
  })
  declare sourceMessageIds: number[]

  @column({
    prepare: (value: AiEvaluationConversationMessage[] | null | undefined) =>
      prepareJson(value ?? []),
    consume: (value: unknown) => consumeJson(value, [] as AiEvaluationConversationMessage[]),
  })
  declare conversationMessages: AiEvaluationConversationMessage[]

  @column()
  declare name: string

  @column()
  declare question: string

  @column()
  declare referenceAnswer: string

  @column({
    prepare: (value: string[] | null | undefined) => prepareJson(value ?? []),
    consume: (value: unknown) => consumeJson(value, [] as string[]),
  })
  declare expectedTools: string[]

  @column({
    prepare: (value: string[] | null | undefined) => prepareJson(value ?? []),
    consume: (value: unknown) => consumeJson(value, [] as string[]),
  })
  declare expectedToolSequence: string[]

  @column({
    prepare: (value: string[] | null | undefined) => prepareJson(value ?? []),
    consume: (value: unknown) => consumeJson(value, [] as string[]),
  })
  declare requiredTerms: string[]

  @column({
    prepare: (value: string[] | null | undefined) => prepareJson(value ?? []),
    consume: (value: unknown) => consumeJson(value, [] as string[]),
  })
  declare forbiddenTerms: string[]

  @column({
    prepare: (value: Record<string, unknown> | null | undefined) => prepareJson(value ?? {}),
    consume: (value: unknown) => consumeJson(value, {} as Record<string, unknown>),
  })
  declare mockToolOutputs: Record<string, unknown>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
