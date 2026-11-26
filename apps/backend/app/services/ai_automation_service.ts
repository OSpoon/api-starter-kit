import encryption from '@adonisjs/core/services/encryption'
import { DateTime } from 'luxon'

import type { AiAutomationScheduleKind, AiAutomationWebhookType } from '#models/ai_automation'
import AiAutomation from '#models/ai_automation'
import type AiAutomationRun from '#models/ai_automation_run'
import type { AiAutomationScheduleInput } from '#services/ai_automation_schedule'
import {
  getNextAiAutomationRunAt,
  validateAiAutomationWebhookUrl,
} from '#services/ai_automation_schedule'

export type AiAutomationPayload = {
  name: string
  prompt: string
  schedule: { cron: string }
  webhookType?: AiAutomationWebhookType
  webhookUrl?: string | null
}

function normalizeSchedule(schedule: AiAutomationPayload['schedule']) {
  const timezone = DateTime.local().zoneName || 'UTC'
  const input: AiAutomationScheduleInput = {
    scheduleKind: 'cron',
    scheduleCron: schedule.cron.trim(),
    timezone,
  }
  const nextRunAt = getNextAiAutomationRunAt(input)
  return {
    scheduleKind: 'cron' as AiAutomationScheduleKind,
    scheduleAt: null,
    scheduleTime: null,
    scheduleCron: schedule.cron.trim(),
    scheduleWeekday: null,
    timezone,
    nextRunAt,
  }
}

function normalizeDeliveries(
  input: AiAutomationPayload,
  existingEncryptedWebhookUrl: string | null = null
) {
  const webhookUrl = input.webhookUrl?.trim()
    ? validateAiAutomationWebhookUrl(input.webhookUrl.trim())
    : null
  const encryptedWebhookUrl =
    input.webhookUrl === undefined
      ? existingEncryptedWebhookUrl
      : webhookUrl
        ? encryption.encrypt(webhookUrl)
        : null
  if (!encryptedWebhookUrl) throw new Error('请配置 Webhook 地址')
  return encryptedWebhookUrl
}

export async function createAiAutomation(userId: number, input: AiAutomationPayload) {
  const schedule = normalizeSchedule(input.schedule)
  const encryptedWebhookUrl = normalizeDeliveries(input)
  return AiAutomation.create({
    userId,
    name: input.name.trim(),
    prompt: input.prompt.trim(),
    ...schedule,
    encryptedWebhookUrl,
    webhookType: input.webhookType ?? 'generic',
    enabled: true,
  })
}

export async function updateAiAutomation(
  automation: AiAutomation,
  input: AiAutomationPayload & { enabled: boolean }
) {
  const schedule = normalizeSchedule(input.schedule)
  const encryptedWebhookUrl = normalizeDeliveries(input, automation.encryptedWebhookUrl)
  automation.merge({
    name: input.name.trim(),
    prompt: input.prompt.trim(),
    ...schedule,
    encryptedWebhookUrl,
    webhookType: input.webhookType ?? automation.webhookType,
    enabled: input.enabled,
    nextRunAt: schedule.nextRunAt,
  })
  await automation.save()
  return automation
}

export async function setAiAutomationEnabled(automation: AiAutomation, enabled: boolean) {
  if (automation.enabled === enabled) return automation
  automation.enabled = enabled
  if (!enabled) {
    automation.nextRunAt = null
  } else if (automation.scheduleKind === 'once') {
    automation.nextRunAt =
      automation.scheduleAt && automation.scheduleAt.toMillis() > DateTime.now().toMillis()
        ? automation.scheduleAt
        : null
  } else {
    automation.nextRunAt = getNextAiAutomationRunAt({
      scheduleKind: automation.scheduleKind,
      scheduleAt: automation.scheduleAt?.toISO() ?? null,
      scheduleTime: automation.scheduleTime,
      scheduleCron: automation.scheduleCron,
      scheduleWeekday: automation.scheduleWeekday,
      timezone: automation.timezone,
    })
  }
  await automation.save()
  return automation
}

export function serializeAiAutomation(automation: AiAutomation, revealWebhookUrl = false) {
  let webhookUrl: string | null = null
  if (revealWebhookUrl && automation.encryptedWebhookUrl) {
    try {
      webhookUrl = encryption.decrypt<string>(automation.encryptedWebhookUrl)
    } catch {
      // The owner can replace an unreadable URL in the edit form.
    }
  }

  return {
    id: automation.id,
    name: automation.name,
    prompt: automation.prompt,
    schedule: {
      kind: automation.scheduleKind,
      cron: automation.scheduleCron,
      at:
        automation.scheduleAt?.setZone(automation.timezone).toFormat("yyyy-MM-dd'T'HH:mm") ?? null,
      time: automation.scheduleTime,
      weekday: automation.scheduleWeekday,
      timezone: automation.timezone,
    },
    nextRunAt: automation.nextRunAt?.toISO() ?? null,
    enabled: automation.enabled,
    webhookConfigured: Boolean(automation.encryptedWebhookUrl),
    webhookUrl,
    webhookType: automation.webhookType,
    createdAt: automation.createdAt.toISO() ?? '',
    updatedAt: automation.updatedAt.toISO() ?? '',
  }
}

export function serializeAiAutomationRun(run: AiAutomationRun) {
  return {
    id: run.id,
    automationId: run.automationId,
    automationName: run.automationName,
    triggerKind: run.triggerKind,
    status: run.status,
    scheduledFor: run.scheduledFor.toISO() ?? '',
    startedAt: run.startedAt?.toISO() ?? null,
    completedAt: run.completedAt?.toISO() ?? null,
    attemptCount: run.attemptCount,
    summary: run.summary,
    error: run.error,
    deliveryResults: run.deliveryResults ?? {},
    createdAt: run.createdAt.toISO() ?? '',
  }
}

export function automationRunConversationTitle(runId: number, automationName: string) {
  return `[自动化运行 ${runId}] ${automationName}`.slice(0, 200)
}
