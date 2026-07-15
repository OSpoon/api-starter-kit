import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'

import AiAgentConfirmation from '#models/ai_agent_confirmation'
import { getAiAgentAction } from '#services/ai_agent_action_registry'
import { recordAuditEvent } from '#services/audit_log'

const confirmationLifetimeMinutes = 5

export type AiAgentConfirmationSummary = {
  id: number
  action: string
  targetType: string
  targetId: string
  targetSummary: Record<string, unknown>
  expiresAt: string | null
}

export class AiAgentConfirmationError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409 | 422
  ) {
    super(message)
  }
}

function serializeConfirmation(confirmation: AiAgentConfirmation): AiAgentConfirmationSummary {
  return {
    id: confirmation.id,
    action: confirmation.action,
    targetType: confirmation.targetType ?? 'unknown',
    targetId: confirmation.targetId ?? String(confirmation.id),
    targetSummary: confirmation.targetSummary ?? {},
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

  const confirmation = await AiAgentConfirmation.create({
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
    .whereNull('assistant_message_id')

  await AiAgentConfirmation.query()
    .where('conversation_id', input.conversationId)
    .where('requested_by_user_id', input.userId)
    .where('agent_run_id', input.agentRunId)
    .whereNull('assistant_message_id')
    .update({ assistantMessageId: input.assistantMessageId })

  return confirmations.map(serializeConfirmation)
}

export async function listConversationConfirmations(conversationId: number, userId: number) {
  const confirmations = await AiAgentConfirmation.query()
    .where('conversation_id', conversationId)
    .where('requested_by_user_id', userId)
    .where('status', 'pending')
    .where('expires_at', '>', DateTime.now().toSQL()!)
    .whereNotNull('assistant_message_id')

  return confirmations.map((confirmation) => ({
    messageId: confirmation.assistantMessageId!,
    ...serializeConfirmation(confirmation),
  }))
}

export async function confirmAiAgentAction(
  ctx: HttpContext,
  input: { confirmationId: number; conversationId: number; userId: number }
) {
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
  if (confirmation.expiresAt <= DateTime.now()) {
    confirmation.status = 'expired'
    await confirmation.save()
    throw new AiAgentConfirmationError('确认请求已过期，请重新发起', 422)
  }

  const action = getAiAgentAction(confirmation.action)
  if (!action) {
    confirmation.status = 'failed'
    await confirmation.save()
    throw new AiAgentConfirmationError('不支持的确认操作', 422)
  }

  try {
    await action.execute({ confirmation, ctx })
  } catch (error) {
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

  return serializeConfirmation(confirmation)
}
