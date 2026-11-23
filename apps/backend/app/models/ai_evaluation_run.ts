import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export type AiEvaluationRunResult = {
  caseId: number
  caseName: string
  question: string
  referenceAnswer: string
  actualAnswer: string
  expectedTools: string[]
  actualTools: string[]
  toolsPassed: boolean
  referenceSimilarity: number
  requiredTerms: Array<{ term: string; passed: boolean }>
  forbiddenTerms: Array<{ term: string; passed: boolean }>
  score: number
  passed: boolean
  error?: string
}

function prepareJson(value: unknown) {
  return JSON.stringify(value)
}

function consumeJson<T>(value: unknown, fallback: T): T {
  if (typeof value === 'string') return JSON.parse(value) as T
  return (value ?? fallback) as T
}

export default class AiEvaluationRun extends BaseModel {
  static table = 'ai_evaluation_runs'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare status: 'queued' | 'running' | 'completed' | 'failed'

  @column()
  declare modelId: string

  @column()
  declare totalCases: number

  @column()
  declare completedCases: number

  @column({
    prepare: (value: number[] | null | undefined) => prepareJson(value ?? []),
    consume: (value: unknown) => consumeJson(value, [] as number[]),
  })
  declare caseIds: number[]

  @column()
  declare score: number | null

  @column({
    prepare: (value: AiEvaluationRunResult[] | null | undefined) => prepareJson(value ?? []),
    consume: (value: unknown) => consumeJson(value, [] as AiEvaluationRunResult[]),
  })
  declare results: AiEvaluationRunResult[]

  @column()
  declare error: string | null

  @column.dateTime()
  declare startedAt: DateTime | null

  @column.dateTime()
  declare completedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
