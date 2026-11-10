import type { HttpContext } from '@adonisjs/core/http'
import { upsertAgentToolResult } from '@api-starter-kit/ai-agent'

import { writeAiChatSse } from '#ai/chat/ai_chat_sse_adapter'
import { summarizeConfirmedToolResult } from '#ai/chat/confirmed_tool_result_summary'
import {
  AiAgentConfirmationError,
  confirmAiAgentAction as executeAiAgentAction,
  findPendingConfirmationTool,
  getAiAgentActionResultMessage,
  listCancelledToolConfirmations,
  listConversationConfirmations,
} from '#ai/core/ai_agent_confirmation'
import { sanitizeAiAgentToolErrorMessage } from '#ai/core/ai_agent_tool_errors'
import AiAgentConfirmation from '#models/ai_agent_confirmation'
import type AiChatConversation from '#models/ai_chat_conversation'
import AiChatMessage from '#models/ai_chat_message'
import {
  serializeAiChatConversation,
  serializeAiChatMessage,
} from '#transformers/ai_chat_transformer'

function getCredentialDisclosure(result: Record<string, unknown> | undefined) {
  const value = result?.credential
  if (!value || typeof value !== 'object') return null
  const credential = value as Record<string, unknown>
  if (
    (credential.kind !== 'api_key' && credential.kind !== 'password') ||
    typeof credential.value !== 'string' ||
    typeof credential.label !== 'string'
  ) {
    return null
  }
  return {
    kind: credential.kind,
    value: credential.value,
    label: credential.label,
  }
}

export async function executeAiChatConfirmationAndCreateMessage(input: {
  ctx: HttpContext
  conversation: AiChatConversation
  confirmationId: number
  userId: number
  response?: HttpContext['response']
}) {
  const { ctx, conversation, confirmationId, userId, response } = input
  const confirmationRecord = await AiAgentConfirmation.query()
    .where('id', confirmationId)
    .where('conversation_id', conversation.id)
    .where('requested_by_user_id', userId)
    .first()
  if (!confirmationRecord) {
    throw new AiAgentConfirmationError('受控操作确认不存在', 404)
  }
  if (!confirmationRecord.assistantMessageId) {
    throw new AiAgentConfirmationError('找不到对应的助手消息', 409)
  }
  let assistantMessage = await AiChatMessage.query()
    .where('id', confirmationRecord.assistantMessageId)
    .where('conversation_id', conversation.id)
    .where('role', 'assistant')
    .first()
  if (!assistantMessage) {
    throw new AiAgentConfirmationError('找不到对应的助手消息', 409)
  }
  const pendingTool = findPendingConfirmationTool(
    assistantMessage.runtimeDetails,
    confirmationId,
    confirmationRecord.action
  )
  const callId = pendingTool?.kind === 'tool' ? pendingTool.callId : undefined
  const isToolAction = confirmationRecord.action === 'call_builtin_tool'
  const executionName =
    isToolAction || pendingTool?.kind !== 'tool' ? 'confirmation_execution' : pendingTool.name
  const executionDetail = {
    ...(pendingTool?.kind === 'tool' ? pendingTool.detail : {}),
    confirmationId,
    ...(pendingTool?.kind === 'tool' && typeof pendingTool.detail?.toolName === 'string'
      ? { toolName: pendingTool.detail.toolName }
      : isToolAction && typeof confirmationRecord.targetSummary?.toolName === 'string'
        ? { toolName: confirmationRecord.targetSummary.toolName }
        : isToolAction && typeof confirmationRecord.targetSummary?.name === 'string'
          ? { toolName: confirmationRecord.targetSummary.name }
          : {}),
  }
  const displayName = pendingTool?.kind === 'tool' ? pendingTool.displayName : undefined
  const activityCallId = callId ?? `confirmation-${confirmationId}`
  const actionStartedAt = Date.now()
  if (response) {
    writeAiChatSse(response, 'agent_status', {
      name: executionName,
      state: 'running',
      callId: activityCallId,
      ...(displayName ? { displayName } : {}),
      startedAt: actionStartedAt,
      phase: 'executing_confirmation',
      detail: executionDetail,
    })
  }
  let confirmation: Awaited<ReturnType<typeof executeAiAgentAction>>
  try {
    confirmation = await executeAiAgentAction(ctx, {
      confirmationId,
      conversationId: conversation.id,
      userId,
    })
  } catch (error) {
    if (response) {
      const errorMessage = sanitizeAiAgentToolErrorMessage(
        error instanceof Error ? error.message : undefined
      )
      writeAiChatSse(response, 'agent_status', {
        name: executionName,
        state: 'error',
        callId: activityCallId,
        ...(displayName ? { displayName } : {}),
        startedAt: actionStartedAt,
        durationMs: Date.now() - actionStartedAt,
        phase: 'failed',
        detail: executionDetail,
        ...(errorMessage ? { message: errorMessage } : {}),
      })
    }
    throw error
  }
  assistantMessage = await AiChatMessage.findOrFail(assistantMessage.id)
  const actionResult =
    confirmation.result && typeof confirmation.result === 'object' ? confirmation.result : undefined
  const toolName = actionResult?.agentToolName
  const completedDetail = {
    ...executionDetail,
    ...(typeof toolName === 'string' ? { toolName } : {}),
  }
  const completedTool = assistantMessage.runtimeDetails.find(
    (item) => item.kind === 'tool' && item.callId === activityCallId
  )
  if (completedTool?.kind === 'tool') {
    completedTool.state = 'done'
    completedTool.phase = 'confirmed'
    completedTool.durationMs = Date.now() - actionStartedAt
    if (displayName) completedTool.displayName = displayName
    await assistantMessage.save()
  }

  const completedPlan = assistantMessage.runtimeDetails.find(
    (item) => item.kind === 'plan' && (item.planType ?? 'confirmation') === 'confirmation'
  )
  if (response && completedPlan?.kind === 'plan') {
    writeAiChatSse(response, 'agent_plan', {
      planType: completedPlan.planType ?? 'confirmation',
      steps: completedPlan.steps,
    })
  }

  if (response) {
    writeAiChatSse(response, 'agent_status', {
      name: executionName,
      state: 'done',
      callId: activityCallId,
      ...(displayName ? { displayName } : {}),
      startedAt: actionStartedAt,
      durationMs: Date.now() - actionStartedAt,
      phase: 'confirmed',
      detail: completedDetail,
    })
  }

  const credential = getCredentialDisclosure(actionResult)
  if (response && credential) writeAiChatSse(response, 'credential_disclosure', { credential })

  if (isToolAction) {
    const resultText =
      typeof actionResult?.agentToolResult === 'string'
        ? actionResult.agentToolResult
        : 'Tool completed without a text result.'
    assistantMessage.agentContext = upsertAgentToolResult(assistantMessage.agentContext, {
      assistantMessageId: assistantMessage.id,
      toolCallId: activityCallId,
      toolName: pendingTool?.kind === 'tool' ? pendingTool.name : executionName,
      text: resultText,
      isError: false,
    })
    await assistantMessage.save()

    const pendingConfirmations = await listConversationConfirmations(conversation.id, userId)
    const messageConfirmations = pendingConfirmations.filter(
      (item) => item.messageId === assistantMessage.id
    )
    if (messageConfirmations.length > 0) {
      if (response) {
        writeAiChatSse(response, 'done', {
          conversation: serializeAiChatConversation(conversation),
          message: serializeAiChatMessage(assistantMessage),
          confirmations: messageConfirmations,
        })
      }
      return { confirmation, actionResult, message: assistantMessage, isToolAction }
    }

    const cancelledConfirmations = await listCancelledToolConfirmations({
      assistantMessageId: assistantMessage.id,
      conversationId: conversation.id,
      userId,
    })
    const { message } = await summarizeConfirmedToolResult({
      ctx,
      conversation,
      assistantMessage,
      userId,
      result: actionResult,
      response,
      continueWithConfiguredTools: cancelledConfirmations.length === 0,
      confirmationBatchResolved: true,
      resolutions: cancelledConfirmations.map((item) => ({
        action: item.action,
        targetSummary: item.targetSummary ?? undefined,
      })),
    })
    return { confirmation, actionResult, message, isToolAction }
  }

  const content = await getAiAgentActionResultMessage({
    confirmationId,
    conversationId: conversation.id,
    userId,
    result: actionResult,
  })
  const delta = `${assistantMessage.content.trim() ? '\n\n' : ''}${content}`
  assistantMessage.content += delta
  await assistantMessage.save()
  if (response) writeAiChatSse(response, 'delta', { content: delta })
  if (response) {
    writeAiChatSse(response, 'done', {
      conversation: serializeAiChatConversation(conversation),
      message: serializeAiChatMessage(assistantMessage),
      confirmations: [],
    })
  }
  return { confirmation, actionResult, message: assistantMessage, isToolAction }
}
