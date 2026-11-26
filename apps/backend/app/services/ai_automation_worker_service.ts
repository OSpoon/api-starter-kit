import { setTimeout as sleep } from 'node:timers/promises'

import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'

import { getAiRequestTimeout } from '#ai/chat/ai_agent_service'
import { getSafeAiErrorMessage } from '#ai/chat/turn/ai_chat_turn_recovery'
import { runAiChatAssistantTurn } from '#ai/chat/turn/ai_chat_turn_service'
import AiAutomation from '#models/ai_automation'
import AiAutomationRun from '#models/ai_automation_run'
import AiChatConversation from '#models/ai_chat_conversation'
import AiChatMessage from '#models/ai_chat_message'
import { deliverAiAutomationRun } from '#services/ai_automation_delivery_service'
import { getNextAiAutomationRunAt } from '#services/ai_automation_schedule'
import { automationRunConversationTitle } from '#services/ai_automation_service'

const heartbeatIntervalMs = 30_000
const staleHeartbeatMs = 120_000

async function enqueueDueAutomations() {
  const now = DateTime.now()
  await db.transaction(async (trx) => {
    const due = await trx
      .from('ai_automations')
      .where('enabled', true)
      .whereNull('deleted_at')
      .whereNotNull('next_run_at')
      .where('next_run_at', '<=', now.toJSDate())
      .whereNotExists((query) => {
        query
          .from('ai_automation_runs')
          .select('id')
          .whereColumn('ai_automation_runs.automation_id', 'ai_automations.id')
          .whereIn('status', ['queued', 'running'])
      })
      .orderBy('next_run_at', 'asc')
      .forUpdate()
      .skipLocked()
      .limit(10)

    for (const automation of due) {
      const scheduledFor = DateTime.fromJSDate(new Date(automation.next_run_at))
      const nextRunAt =
        automation.schedule_kind === 'once'
          ? null
          : getNextAiAutomationRunAt(
              {
                scheduleKind: automation.schedule_kind,
                scheduleAt: automation.schedule_at
                  ? new Date(automation.schedule_at).toISOString()
                  : null,
                scheduleTime: automation.schedule_time,
                scheduleCron: automation.schedule_cron,
                scheduleWeekday: automation.schedule_weekday,
                timezone: automation.timezone,
              },
              now
            ).toJSDate()
      await trx
        .from('ai_automations')
        .where('id', automation.id)
        .update({ enabled: automation.schedule_kind !== 'once', next_run_at: nextRunAt })
      await trx.table('ai_automation_runs').insert({
        automation_id: automation.id,
        user_id: automation.user_id,
        automation_name: automation.name,
        trigger_kind: 'scheduled',
        status: 'queued',
        scheduled_for: scheduledFor.toJSDate(),
        attempt_count: 0,
        delivery_results: '{}',
        created_at: now.toJSDate(),
        updated_at: now.toJSDate(),
      })
    }
  })
}

async function recoverStaleRun() {
  const staleBefore = DateTime.now().minus({ milliseconds: staleHeartbeatMs }).toJSDate()
  return db.transaction(async (trx) => {
    const run = await trx
      .from('ai_automation_runs')
      .where('status', 'running')
      .where('heartbeat_at', '<', staleBefore)
      .orderBy('heartbeat_at', 'asc')
      .forUpdate()
      .skipLocked()
      .first()
    if (!run) return null
    await trx.from('ai_automation_runs').where('id', run.id).update({
      status: 'failed',
      error: 'Worker heartbeat expired',
      heartbeat_at: null,
      completed_at: new Date(),
      updated_at: new Date(),
    })
    return run.id as number
  })
}

async function claimQueuedRun() {
  return db.transaction(async (trx) => {
    const run = await trx
      .from('ai_automation_runs')
      .where('status', 'queued')
      .orderBy('scheduled_for', 'asc')
      .forUpdate()
      .skipLocked()
      .first()
    if (!run) return null
    const now = new Date()
    await trx
      .from('ai_automation_runs')
      .where('id', run.id)
      .update({
        status: 'running',
        started_at: run.started_at ?? now,
        heartbeat_at: now,
        attempt_count: run.attempt_count + 1,
        updated_at: now,
      })
    return run.id as number
  })
}

async function finishRun(
  run: AiAutomationRun,
  automation: AiAutomation,
  status: 'completed' | 'failed',
  summary: string,
  error: string | null
) {
  const completedAt = DateTime.now()
  const updated = await AiAutomationRun.query()
    .where('id', run.id)
    .where('status', 'running')
    .update({
      status,
      summary: summary.slice(0, 20_000),
      error,
      completedAt,
      heartbeatAt: null,
      updatedAt: completedAt,
    })
  if (!updated) return
  await run.refresh()
  run.deliveryResults = await deliverAiAutomationRun({
    automation,
    run,
    status,
    summary: run.summary ?? '',
    error,
  })
  await run.save()
}

async function deliverStaleRunFailure(runId: number) {
  const run = await AiAutomationRun.find(runId)
  const automation = run?.automationId ? await AiAutomation.find(run.automationId) : null
  if (!run || !automation) return
  run.deliveryResults = await deliverAiAutomationRun({
    automation,
    run,
    status: 'failed',
    summary: run.summary ?? '',
    error: run.error,
  })
  await run.save()
}

async function executeQueuedRun(runId: number) {
  const run = await AiAutomationRun.find(runId)
  if (!run || run.status !== 'running') return
  const automation = run.automationId ? await AiAutomation.find(run.automationId) : null
  if (!automation) {
    run.status = 'failed'
    run.error = '自动化任务已不可用'
    run.completedAt = DateTime.now()
    run.heartbeatAt = null
    await run.save()
    return
  }

  const conversation = await AiChatConversation.create({
    userId: run.userId,
    apiKeyId: null,
    embedSessionId: null,
    automationRunId: run.id,
    title: automationRunConversationTitle(run.id, automation.name),
  })
  const userMessage = await AiChatMessage.create({
    conversationId: conversation.id,
    role: 'user',
    content: automation.prompt,
  })
  const abort = new AbortController()
  const timeout = setTimeout(() => abort.abort(), await getAiRequestTimeout())
  const heartbeat = setInterval(() => {
    void AiAutomationRun.query()
      .where('id', run.id)
      .where('status', 'running')
      .update({ heartbeatAt: DateTime.now() })
  }, heartbeatIntervalMs)
  try {
    const assistantMessage = await runAiChatAssistantTurn({
      conversation,
      userId: run.userId,
      userMessage,
      regeneration: null,
      capabilityMode: 'automation-readonly',
      signal: abort.signal,
      onEvent: () => undefined,
    })
    const runSummary = assistantMessage.runtimeDetails.findLast((detail) => detail.kind === 'run')
    const failed = runSummary?.kind === 'run' && runSummary.state === 'error'
    await finishRun(
      run,
      automation,
      failed ? 'failed' : 'completed',
      assistantMessage.content,
      failed ? 'Agent 执行失败，请查看运行内容。' : null
    )
  } catch (error) {
    await finishRun(run, automation, 'failed', '', getSafeAiErrorMessage(error))
  } finally {
    clearTimeout(timeout)
    clearInterval(heartbeat)
  }
}

export async function runAiAutomationWorker() {
  let stopping = false
  const stop = () => {
    stopping = true
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  try {
    while (!stopping) {
      const staleRunId = await recoverStaleRun()
      if (staleRunId) await deliverStaleRunFailure(staleRunId)
      await enqueueDueAutomations()
      const runId = await claimQueuedRun()
      if (runId) await executeQueuedRun(runId)
      else await sleep(1_000)
    }
  } finally {
    process.off('SIGINT', stop)
    process.off('SIGTERM', stop)
  }
}
