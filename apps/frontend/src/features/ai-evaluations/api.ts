import { ApiError, apiRequest } from '@/lib/api'
import { readItem } from '@/lib/api-types'
import { buildListQuery } from '@/lib/list-query'

export type AiEvaluationCase = {
  id: number
  sourceConversationId: number | null
  name: string
  question: string
  referenceAnswer: string
  expectedTools: string[]
  expectedToolSequence: string[]
  requiredTerms: string[]
  forbiddenTerms: string[]
  mockToolOutputs: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type AiEvaluationCaseInput = Omit<AiEvaluationCase, 'id' | 'createdAt' | 'updatedAt'>

export type AiEvaluationCaseResult = {
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

export type AiEvaluationCaseHistoryItem = {
  runId: number
  modelId: string
  status: AiEvaluationRun['status']
  createdAt: string
  completedAt: string | null
  result: AiEvaluationCaseResult
}

export type AiEvaluationRun = {
  id: number
  status: 'queued' | 'running' | 'completed' | 'failed'
  modelId: string
  caseIds: number[]
  totalCases: number
  completedCases: number
  score: number | null
  results: AiEvaluationCaseResult[]
  error: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

type Page<T> = { items: T[]; meta: { currentPage: number; lastPage: number; total: number } }
export type AiEvaluationSource = 'chat' | 'manual'

function authOptions(token: string | null) {
  return { token }
}

export async function listAiEvaluationCases(
  token: string | null,
  page = 1,
  name = '',
  question = '',
  source?: AiEvaluationSource
) {
  const extra: Record<string, string> = {}
  if (name.trim()) extra.name = name.trim()
  if (question.trim()) extra.question = question.trim()
  if (source) extra.source = source
  return readItem(
    await apiRequest<Page<AiEvaluationCase>>(
      `/api/v1/system/ai-evaluations?${buildListQuery(page, extra)}`,
      authOptions(token)
    )
  )
}

export async function createAiEvaluationCase(token: string | null, input: AiEvaluationCaseInput) {
  return readItem(
    await apiRequest<AiEvaluationCase>('/api/v1/system/ai-evaluations', {
      ...authOptions(token),
      method: 'POST',
      body: JSON.stringify(input),
    })
  )
}

export async function updateAiEvaluationCase(
  token: string | null,
  id: number,
  input: AiEvaluationCaseInput
) {
  return readItem(
    await apiRequest<AiEvaluationCase>(`/api/v1/system/ai-evaluations/${id}`, {
      ...authOptions(token),
      method: 'PUT',
      body: JSON.stringify(input),
    })
  )
}

export async function deleteAiEvaluationCase(token: string | null, id: number) {
  return readItem(
    await apiRequest<{ id: number; deleted: boolean }>(`/api/v1/system/ai-evaluations/${id}`, {
      ...authOptions(token),
      method: 'DELETE',
    })
  )
}

export async function importAiEvaluationMessages(
  token: string | null,
  conversationId: number,
  messageIds: number[]
) {
  return readItem(
    await apiRequest<AiEvaluationCase>('/api/v1/system/ai-evaluations/import-conversation', {
      ...authOptions(token),
      method: 'POST',
      body: JSON.stringify({ conversationId, messageIds }),
    })
  )
}

export async function listAiEvaluationRuns(token: string | null, page = 1) {
  return readItem(
    await apiRequest<Page<AiEvaluationRun>>(
      `/api/v1/system/ai-evaluations/runs?${buildListQuery(page)}`,
      authOptions(token)
    )
  )
}

export async function listAiEvaluationCaseHistory(token: string | null, caseId: number, page = 1) {
  return readItem(
    await apiRequest<Page<AiEvaluationCaseHistoryItem>>(
      `/api/v1/system/ai-evaluations/${caseId}/history?${buildListQuery(page, {}, 20)}`,
      authOptions(token)
    )
  )
}

export async function startAiEvaluationRun(token: string | null, caseIds?: number[]) {
  return readItem(
    await apiRequest<AiEvaluationRun>('/api/v1/system/ai-evaluations/runs', {
      ...authOptions(token),
      method: 'POST',
      ...(caseIds ? { body: JSON.stringify({ caseIds }) } : {}),
    })
  )
}

export async function getAiEvaluationRun(token: string | null, runId: number) {
  return readItem(
    await apiRequest<AiEvaluationRun>(
      `/api/v1/system/ai-evaluation-runs/${runId}`,
      authOptions(token)
    )
  )
}

export function isAiEvaluationConflict(error: unknown) {
  return error instanceof ApiError && error.status === 409
}
