import { ApiError, apiRequest } from '@/lib/api'
import { readItem } from '@/lib/api-types'
import { buildListQuery } from '@/lib/list-query'

export type AiAutomationScheduleKind = 'once' | 'daily' | 'weekdays' | 'weekly' | 'cron'
export type AiAutomationWebhookType = 'generic' | 'wecom'
export type AiAutomationSchedule = {
  kind: AiAutomationScheduleKind
  cron: string | null
  at: string | null
  time: string | null
  weekday: number | null
  timezone: string
}

export type AiAutomation = {
  id: number
  name: string
  prompt: string
  schedule: AiAutomationSchedule
  nextRunAt: string | null
  enabled: boolean
  webhookConfigured: boolean
  webhookUrl: string | null
  webhookType: AiAutomationWebhookType
  createdAt: string
  updatedAt: string
}

export type AiAutomationInput = {
  name: string
  prompt: string
  schedule: { cron: string }
  webhookType?: AiAutomationWebhookType
  webhookUrl?: string | null
}

export type AiAutomationRun = {
  id: number
  automationId: number | null
  automationName: string
  triggerKind: 'scheduled' | 'manual'
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  scheduledFor: string
  startedAt: string | null
  completedAt: string | null
  attemptCount: number
  summary: string | null
  error: string | null
  deliveryResults: Partial<Record<'webhook', { status: 'sent' | 'failed'; error?: string }>>
  createdAt: string
}

type Page<T> = { items: T[]; meta: { currentPage: number; lastPage: number; total: number } }
type AiAutomationFilters = { name?: string; schedule?: string }
export type AutomationListItem = AiAutomation & {
  latestRun: Pick<AiAutomationRun, 'id' | 'status' | 'createdAt'> | null
}
type AutomationDetails = {
  automation: AiAutomation
  runs: Page<AiAutomationRun>
}

function authOptions(token: string | null) {
  return { token }
}

export async function listAiAutomations(
  token: string | null,
  page = 1,
  filters: AiAutomationFilters = {}
) {
  const extra: Record<string, string> = {}
  if (filters.name?.trim()) extra.name = filters.name.trim()
  if (filters.schedule?.trim()) extra.schedule = filters.schedule.trim()
  return readItem(
    await apiRequest<Page<AutomationListItem>>(
      `/api/v1/system/ai-automations?${buildListQuery(page, extra)}`,
      authOptions(token)
    )
  )
}

export async function createAiAutomation(token: string | null, input: AiAutomationInput) {
  return readItem(
    await apiRequest<AiAutomation>('/api/v1/system/ai-automations', {
      ...authOptions(token),
      method: 'POST',
      body: JSON.stringify(input),
    })
  )
}

export async function previewAiAutomationSchedule(token: string | null, cron: string) {
  return readItem(
    await apiRequest<{ times: string[] }>('/api/v1/system/ai-automations/preview', {
      ...authOptions(token),
      method: 'POST',
      body: JSON.stringify({ cron }),
    })
  )
}

export async function updateAiAutomation(
  token: string | null,
  id: number,
  input: AiAutomationInput & { enabled: boolean }
) {
  return readItem(
    await apiRequest<AiAutomation>(`/api/v1/system/ai-automations/${id}`, {
      ...authOptions(token),
      method: 'PUT',
      body: JSON.stringify(input),
    })
  )
}

export async function setAiAutomationEnabled(token: string | null, id: number, enabled: boolean) {
  return readItem(
    await apiRequest<AiAutomation>(`/api/v1/system/ai-automations/${id}/enabled`, {
      ...authOptions(token),
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    })
  )
}

export async function deleteAiAutomation(token: string | null, id: number) {
  return readItem(
    await apiRequest<{ id: number; deleted: boolean }>(`/api/v1/system/ai-automations/${id}`, {
      ...authOptions(token),
      method: 'DELETE',
    })
  )
}

export async function runAiAutomationNow(token: string | null, id: number) {
  return readItem(
    await apiRequest<AiAutomationRun>(`/api/v1/system/ai-automations/${id}/run`, {
      ...authOptions(token),
      method: 'POST',
    })
  )
}

export async function getAiAutomation(token: string | null, id: number, page = 1) {
  return readItem(
    await apiRequest<AutomationDetails>(
      `/api/v1/system/ai-automations/${id}?${buildListQuery(page)}`,
      authOptions(token)
    )
  )
}

export function isAiAutomationConflict(error: unknown) {
  return error instanceof ApiError && error.status === 409
}
