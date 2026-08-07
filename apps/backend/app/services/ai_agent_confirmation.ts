import crypto from 'node:crypto'

import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'

import AiAgentConfirmation from '#models/ai_agent_confirmation'
import {
  AiAgentActionAuthorizationError,
  type AiAgentActionImpact,
  getAiAgentAction,
  getAiAgentActionChangeSummary,
} from '#services/ai_agent_action_registry'
import { recordAuditEvent } from '#services/audit_log'

const confirmationLifetimeMinutes = 5

export type AiAgentActionToolArtifact =
  | { kind: 'confirmation'; confirmation: AiAgentConfirmationSummary }
  | {
      kind: 'action_error'
      code: 'permission_denied' | 'invalid_input' | 'conflict' | 'failed'
      message: string
    }

export function createAiAgentActionToolResult(
  artifact: AiAgentActionToolArtifact
): [string, AiAgentActionToolArtifact] {
  return [JSON.stringify(artifact), artifact]
}

export type AiAgentConfirmationSummary = {
  id: number
  action: string
  impact: AiAgentActionImpact
  targetType: string
  targetId: string
  targetSummary: Record<string, unknown>
  changeSummary: Array<{ field: string; value: string }>
  expiresAt: string | null
}

export class AiAgentConfirmationError extends Error {
  constructor(
    message: string,
    readonly status: 403 | 404 | 409 | 422
  ) {
    super(message)
  }
}

function serializeConfirmation(confirmation: AiAgentConfirmation): AiAgentConfirmationSummary {
  const action = getAiAgentAction(confirmation.action)
  return {
    id: confirmation.id,
    action: confirmation.action,
    impact: action?.impact ?? 'destructive',
    targetType: confirmation.targetType ?? 'unknown',
    targetId: confirmation.targetId ?? String(confirmation.id),
    targetSummary: confirmation.targetSummary ?? {},
    changeSummary: getAiAgentActionChangeSummary(confirmation.action, confirmation.payload),
    expiresAt: confirmation.expiresAt.toISO(),
  }
}

export async function proposeAiAgentAction(input: {
  action: string
  actionInput: Record<string, unknown>
  conversationId: number
  userId: number
  agentRunId: string
}) {
  const action = getAiAgentAction(input.action)
  if (!action) {
    throw new AiAgentConfirmationError('不支持的受控操作', 422)
  }

  let preparation
  try {
    preparation = await action.prepare(input.actionInput)
  } catch (error) {
    throw new AiAgentConfirmationError(
      error instanceof Error ? error.message : '无法准备受控操作',
      409
    )
  }

  const existing = await AiAgentConfirmation.query()
    .where('conversation_id', input.conversationId)
    .where('requested_by_user_id', input.userId)
    .where('agent_run_id', input.agentRunId)
    .where('action', input.action)
    .where('target_type', preparation.targetType)
    .where('target_id', preparation.targetId)
    .where('status', 'pending')
    .first()
  if (existing && existing.expiresAt > DateTime.now()) return serializeConfirmation(existing)
  if (existing) {
    existing.status = 'expired'
    await existing.save()
  }

  let confirmation: AiAgentConfirmation
  try {
    confirmation = await AiAgentConfirmation.create({
      conversationId: input.conversationId,
      requestedByUserId: input.userId,
      agentRunId: input.agentRunId,
      action: input.action,
      targetType: preparation.targetType,
      targetId: preparation.targetId,
      targetSummary: preparation.targetSummary,
      payload: preparation.payload,
      status: 'pending',
      expiresAt: DateTime.now().plus({ minutes: confirmationLifetimeMinutes }),
    })
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== '23505') throw error
    confirmation = await AiAgentConfirmation.query()
      .where('conversation_id', input.conversationId)
      .where('requested_by_user_id', input.userId)
      .where('agent_run_id', input.agentRunId)
      .where('action', input.action)
      .where('target_type', preparation.targetType)
      .where('target_id', preparation.targetId)
      .where('status', 'pending')
      .firstOrFail()
  }

  return serializeConfirmation(confirmation)
}

export async function attachAgentRunConfirmations(input: {
  conversationId: number
  userId: number
  agentRunId: string
  assistantMessageId: number
}) {
  const confirmations = await AiAgentConfirmation.query()
    .where('conversation_id', input.conversationId)
    .where('requested_by_user_id', input.userId)
    .where('agent_run_id', input.agentRunId)
    .where('status', 'pending')
    .whereNull('execution_token')
    .whereNull('assistant_message_id')

  await AiAgentConfirmation.query()
    .where('conversation_id', input.conversationId)
    .where('requested_by_user_id', input.userId)
    .where('agent_run_id', input.agentRunId)
    .where('status', 'pending')
    .whereNull('execution_token')
    .whereNull('assistant_message_id')
    .update({ assistantMessageId: input.assistantMessageId })

  return confirmations.map(serializeConfirmation)
}

export async function listConversationConfirmations(conversationId: number, userId: number) {
  const confirmations = await AiAgentConfirmation.query()
    .where('conversation_id', conversationId)
    .where('requested_by_user_id', userId)
    .where('status', 'pending')
    .whereNull('execution_token')
    .where('expires_at', '>', DateTime.now().toSQL()!)
    .whereNotNull('assistant_message_id')

  return confirmations.map((confirmation) => ({
    messageId: confirmation.assistantMessageId!,
    ...serializeConfirmation(confirmation),
  }))
}

export async function failUnattachedAgentRunConfirmations(input: {
  conversationId: number
  userId: number
  agentRunId: string
  ctx: HttpContext
}) {
  const orphans = await AiAgentConfirmation.query()
    .where('conversation_id', input.conversationId)
    .where('requested_by_user_id', input.userId)
    .where('agent_run_id', input.agentRunId)
    .where('status', 'pending')
    .whereNull('assistant_message_id')
  if (!orphans.length) return

  await AiAgentConfirmation.query()
    .whereIn(
      'id',
      orphans.map((row) => row.id)
    )
    .update({ status: 'failed' })

  for (const confirmation of orphans) {
    await recordAuditEvent(input.ctx, {
      actorUserId: input.userId,
      action: 'agent.proposal_failed',
      targetType: confirmation.targetType ?? 'agent_action',
      targetId: confirmation.targetId,
      metadata: {
        action: confirmation.action,
        confirmationId: confirmation.id,
        reason: 'agent_run_unattached',
        source: 'ai_agent',
      },
    })
  }
}

export async function confirmAiAgentAction(
  ctx: HttpContext,
  input: { confirmationId: number; conversationId: number; userId: number }
) {
  const now = DateTime.now()
  const executionToken = crypto.randomUUID()
  const confirmation = await AiAgentConfirmation.query()
    .where('id', input.confirmationId)
    .where('conversation_id', input.conversationId)
    .where('requested_by_user_id', input.userId)
    .first()
  if (!confirmation) {
    throw new AiAgentConfirmationError('确认请求不存在', 404)
  }
  if (confirmation.status !== 'pending') {
    throw new AiAgentConfirmationError('确认请求已处理', 409)
  }
  if (confirmation.expiresAt <= now) {
    confirmation.status = 'expired'
    await confirmation.save()
    await recordAuditEvent(ctx, {
      actorUserId: input.userId,
      action: 'agent.proposal_expired',
      targetType: confirmation.targetType ?? 'agent_action',
      targetId: confirmation.targetId,
      metadata: {
        action: confirmation.action,
        confirmationId: confirmation.id,
        source: 'ai_agent',
      },
    })
    throw new AiAgentConfirmationError('确认请求已过期，请重新发起', 422)
  }

  if (confirmation.executionToken) {
    throw new AiAgentConfirmationError('确认请求正在处理中', 409)
  }

  const claimed = await AiAgentConfirmation.query()
    .where('id', confirmation.id)
    .where('status', 'pending')
    .whereNull('execution_token')
    .where('expires_at', '>', now.toSQL()!)
    .update({ executionToken, executionStartedAt: now })
  if (claimed[0] !== 1) {
    throw new AiAgentConfirmationError('确认请求已被处理或已过期', 409)
  }

  confirmation.executionToken = executionToken
  confirmation.executionStartedAt = now

  const action = getAiAgentAction(confirmation.action)
  if (!action) {
    confirmation.status = 'failed'
    await confirmation.save()
    throw new AiAgentConfirmationError('不支持的确认操作', 422)
  }

  let executionResult: Record<string, unknown> | void
  try {
    executionResult = await action.execute({ confirmation, ctx })
  } catch (error) {
    if (error instanceof AiAgentActionAuthorizationError) {
      await AiAgentConfirmation.query()
        .where('id', confirmation.id)
        .where('execution_token', executionToken)
        .update({ executionToken: null, executionStartedAt: null })
      throw new AiAgentConfirmationError(error.message, 403)
    }
    confirmation.status = 'failed'
    await confirmation.save()
    throw new AiAgentConfirmationError(
      error instanceof Error ? error.message : '受控操作执行失败',
      409
    )
  }

  confirmation.status = 'confirmed'
  confirmation.confirmedAt = DateTime.now()
  confirmation.confirmedByUserId = input.userId
  await confirmation.save()

  await recordAuditEvent(ctx, {
    actorUserId: input.userId,
    action: 'agent.action_confirmed',
    targetType: confirmation.targetType ?? 'agent_action',
    targetId: confirmation.targetId,
    metadata: { action: confirmation.action, confirmationId: confirmation.id, source: 'ai_agent' },
  })

  return {
    ...serializeConfirmation(confirmation),
    ...(executionResult ? { result: executionResult } : {}),
  }
}
