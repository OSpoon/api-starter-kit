import crypto from 'node:crypto'

import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'

import {
  type AiAgentActionImpact,
  ensureAiAgentActionPermission,
  getAiAgentAction,
  getAiAgentActionChangeSummary,
} from '#ai/core/ai_agent_action_registry'
import { AiAgentPermissionDeniedError } from '#ai/core/ai_agent_authorization'
import { sanitizeAiAgentToolErrorMessage } from '#ai/core/ai_agent_tool_errors'
import AiAgentConfirmation from '#models/ai_agent_confirmation'
import AiChatMessage, { type AiChatRuntimeDetail } from '#models/ai_chat_message'
import ApiKey from '#models/api_key'
import { recordAuditEvent } from '#services/audit_log'

const confirmationLifetimeMinutes = 5

export function findPendingConfirmationTool(
  runtimeDetails: AiChatRuntimeDetail[],
  confirmationId: number,
  action: string
) {
  const pendingTools = runtimeDetails.filter(
    (item): item is Extract<AiChatRuntimeDetail, { kind: 'tool' }> =>
      item.kind === 'tool' && item.phase === 'awaiting_confirmation'
  )
  const exactMatch = pendingTools.find((item) => item.detail?.confirmationId === confirmationId)
  if (exactMatch) return exactMatch

  const actionMatches = pendingTools.filter(
    (item) => item.detail?.confirmationId === undefined && item.detail?.action === action
  )
  if (actionMatches.length === 1) return actionMatches[0]

  const isSingleAnonymousTool =
    pendingTools.length === 1 &&
    pendingTools[0]?.detail?.confirmationId === undefined &&
    pendingTools[0]?.detail?.action === undefined
  return isSingleAnonymousTool ? pendingTools[0] : undefined
}

export type AiAgentActionToolArtifact = {
  kind: 'action_error'
  code: 'permission_denied' | 'invalid_input' | 'conflict' | 'failed'
  message: string
}

export type AiAgentConfirmationSummary = {
  id: number
  action: string
  status: AiAgentConfirmation['status']
  impact: AiAgentActionImpact
  targetType: string
  targetId: string | null
  targetSummary: Record<string, unknown>
  changeSummary: Array<{ field: string; value: string }>
  expiresAt: string | null
  presentation: {
    title: string
    summary: string
    targetLabel: string | null
    changes: Array<{ label: string; value: string }>
    impactLabel: string
    approveLabel: string
    cancelLabel: string
  }
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
  const changeSummary = getAiAgentActionChangeSummary(confirmation.action, confirmation.payload)
  const targetSummary = confirmation.targetSummary ?? {}
  return {
    id: confirmation.id,
    action: confirmation.action,
    status: confirmation.status,
    impact: action?.impact ?? 'destructive',
    targetType: confirmation.targetType ?? 'unknown',
    targetId: confirmation.targetId,
    targetSummary,
    changeSummary,
    expiresAt: confirmation.expiresAt.toISO(),
    presentation: {
      title: getActionTitle(confirmation.action),
      summary:
        confirmation.status === 'pending'
          ? '请确认是否执行以下操作。'
          : confirmation.status === 'confirmed'
            ? '操作已执行。'
            : confirmation.status === 'cancelled'
              ? '操作已取消，未执行。'
              : '操作未执行。',
      targetLabel: getTargetLabel(confirmation.targetId, targetSummary),
      changes: changeSummary.map(({ field, value }) => ({
        label: getChangeLabel(field, confirmation.action),
        value: getChangeValue(value, confirmation.status),
      })),
      impactLabel:
        action?.impact === 'destructive'
          ? '此操作可能不可逆，请谨慎确认。'
          : '执行前会再次验证权限和操作状态。',
      approveLabel: '确认执行',
      cancelLabel: '取消',
    },
  }
}

async function appendConfirmationRuntimeDetail(
  confirmation: AiAgentConfirmation,
  status: 'confirmed' | 'failed' | 'expired' | 'cancelled',
  errorMessage?: string
) {
  if (!confirmation.assistantMessageId) return
  const message = await AiChatMessage.find(confirmation.assistantMessageId)
  if (!message || message.role !== 'assistant') return
  const targetLabel = getTargetLabel(confirmation.targetId, confirmation.targetSummary ?? {})
  const pendingTool = findPendingConfirmationTool(
    message.runtimeDetails,
    confirmation.id,
    confirmation.action
  )
  if (pendingTool?.kind === 'tool') {
    pendingTool.phase = status
    pendingTool.state = status === 'failed' || status === 'expired' ? 'error' : 'done'
    const sanitizedMessage = sanitizeAiAgentToolErrorMessage(errorMessage)
    delete pendingTool.message
    if (sanitizedMessage) pendingTool.message = sanitizedMessage
    if (
      status === 'confirmed' &&
      ['call_mcp_tool', 'call_builtin_tool'].includes(confirmation.action)
    ) {
      pendingTool.name = 'confirmation_execution'
      const toolName = confirmation.targetSummary?.name
      if (typeof toolName === 'string') {
        pendingTool.detail = { ...pendingTool.detail, toolName }
      }
    }
    for (const item of message.runtimeDetails) {
      if (item.kind !== 'plan') continue
      for (const step of item.steps) {
        if (step.key !== 'await_confirmation') continue
        if (step.state === 'running' && typeof step.startedAt === 'number') {
          step.durationMs = Math.max(0, Date.now() - step.startedAt)
        }
        step.state = 'done'
      }
    }
    await message.save()
    return
  }
  message.runtimeDetails = [
    ...message.runtimeDetails,
    {
      kind: 'confirmation',
      action: confirmation.action,
      ...(targetLabel ? { targetLabel } : {}),
      status,
      completedAt: DateTime.now().toISO() ?? new Date().toISOString(),
    },
  ]
  await message.save()
}

const actionTitles: Record<string, string> = {
  revoke_api_key: '确认吊销 API Key',
  delete_api_key: '确认删除 API Key',
  create_api_key: '确认创建 API Key',
  reset_user_password: '确认重置用户密码',
  create_user: '确认创建用户',
  disable_user: '确认停用用户',
  enable_user: '确认启用用户',
  update_user: '确认更新用户',
  delete_user: '确认删除用户',
  create_role: '确认创建角色',
  update_role: '确认更新角色',
  delete_role: '确认删除角色',
  create_permission: '确认创建权限',
  update_permission: '确认更新权限',
  delete_permission: '确认删除权限',
  send_wecom_message: '确认发送企业微信消息',
  call_mcp_tool: '确认调用 MCP 工具',
  call_builtin_tool: '确认调用工具',
}

function getActionTitle(action: string) {
  return actionTitles[action] ?? '确认系统管理操作'
}
function getTargetLabel(targetId: string | null, summary: Record<string, unknown>) {
  const name = summary.name ?? summary.fullName ?? summary.code
  return typeof name === 'string' ? name : targetId
}
function getChangeLabel(field: string, action: string) {
  if (field === 'tool_name') return action === 'call_mcp_tool' ? 'MCP 工具' : '工具'
  return (
    (
      {
        result: '操作结果',
        name: '名称',
        expiry: '有效期',
        account_status: '账号状态',
        full_name: '姓名',
        email: '邮箱',
        role_ids: '角色',
        code: '编码',
        description: '说明',
        permission_ids: '权限',
        group: '分组',
        parameter_names: '参数字段与类型',
      } as Record<string, string>
    )[field] ?? field
  )
}
function getChangeValue(value: string, status: AiAgentConfirmation['status']) {
  const operations: Record<string, string> = {
    revoked: '吊销',
    permanently_deleted: '永久删除',
    disabled: '停用',
    enabled: '启用',
    new_temporary_password: '生成新的临时密码',
    send_wecom_message: '发送企业微信消息',
  }
  const operation = operations[value]
  if (!operation) return value
  const states: Partial<Record<AiAgentConfirmation['status'], string>> = {
    pending: '待确认',
    confirmed: '已执行',
    cancelled: '已取消，未执行',
  }
  return `${operation}（${states[status] ?? '未执行'}）`
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
    await ensureAiAgentActionPermission(input.userId, input.action)
    preparation = await action.prepare(input.actionInput, input.userId)
  } catch (error) {
    throw new AiAgentConfirmationError(
      error instanceof Error ? error.message : '无法准备受控操作',
      error instanceof AiAgentPermissionDeniedError ? 403 : 409
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

export async function listPendingConversationConfirmations(conversationId: number, userId: number) {
  const confirmations = await AiAgentConfirmation.query()
    .where('conversation_id', conversationId)
    .where('requested_by_user_id', userId)
    .where('status', 'pending')
    .whereNull('execution_token')
    .where('expires_at', '>', DateTime.now().toSQL()!)

  return confirmations.map(serializeConfirmation)
}

export async function getAiAgentActionResultMessage(input: {
  confirmationId: number
  conversationId: number
  userId: number
  result?: Record<string, unknown>
}) {
  const confirmation = await AiAgentConfirmation.query()
    .where('id', input.confirmationId)
    .where('conversation_id', input.conversationId)
    .where('requested_by_user_id', input.userId)
    .first()

  if (!confirmation || confirmation.status !== 'confirmed') {
    return '操作已执行，但状态查询未确认完成，请稍后刷新并检查操作记录。'
  }

  if (confirmation.action === 'create_api_key') {
    const apiKeyId =
      input.result && 'apiKeyId' in input.result ? Number(input.result.apiKeyId) : Number.NaN
    const apiKey = Number.isSafeInteger(apiKeyId) ? await ApiKey.find(apiKeyId) : null
    if (apiKey) {
      return `API Key 已创建成功。名称：${apiKey.name}；前缀：${apiKey.prefix}；有效期：${apiKey.expiresAt ? apiKey.expiresAt.toFormat('yyyy-MM-dd HH:mm') : '长期'}；创建时间：${apiKey.createdAt.toFormat('yyyy-MM-dd HH:mm')}。可在 API 密钥菜单中查看。`
    }
    return 'API Key 已执行创建，但查询不到刚创建的记录，请刷新 API 密钥菜单确认。'
  }

  if (confirmation.action === 'call_builtin_tool') {
    const toolName = input.result?.agentToolName
    const toolResult = input.result?.agentToolResult
    if (typeof toolName === 'string' && typeof toolResult === 'string') {
      return `工具 ${toolName} 已执行，返回结果：${toolResult}`
    }
  }

  const summary = confirmation.targetSummary ?? {}
  const target = [summary.name, summary.fullName, summary.code].find(
    (value): value is string => typeof value === 'string' && value.trim() !== ''
  )
  const targetLabel = target ? `「${target}」` : ''
  const completedActions: Record<string, string> = {
    revoke_api_key: `API Key${targetLabel}已吊销`,
    delete_api_key: `API Key${targetLabel}已永久删除`,
    disable_user: `用户 ${targetLabel}已禁用`,
    enable_user: `用户 ${targetLabel}已启用`,
    update_user: `用户 ${targetLabel}的信息已更新`,
    delete_user: `用户 ${targetLabel}已删除`,
    reset_user_password: `用户 ${targetLabel}的密码已重置；临时密码已通过当前网页会话的一次性安全消息展示`,
    create_user: `用户 ${targetLabel}已创建；初始密码已通过当前网页会话的一次性安全消息展示`,
    create_role: `角色 ${targetLabel}已创建`,
    update_role: `角色 ${targetLabel}已更新`,
    delete_role: `角色 ${targetLabel}已删除`,
    send_wecom_message: `企业微信消息模板 ${targetLabel}已发送`,
  }
  const completedAction = completedActions[confirmation.action]
  if (completedAction) {
    return `${completedAction}。完成时间：${confirmation.confirmedAt?.toFormat('yyyy-MM-dd HH:mm') ?? '刚刚'}。`
  }

  return `受控操作已完成。操作：${confirmation.action}；状态：已确认；完成时间：${confirmation.confirmedAt?.toFormat('yyyy-MM-dd HH:mm') ?? '刚刚'}。`
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
    await appendConfirmationRuntimeDetail(confirmation, 'expired', '确认请求已过期，请重新发起')
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
    await appendConfirmationRuntimeDetail(confirmation, 'failed', '不支持的确认操作')
    throw new AiAgentConfirmationError('不支持的确认操作', 422)
  }

  let executionResult: Record<string, unknown> | void
  try {
    await ensureAiAgentActionPermission(input.userId, confirmation.action)
    executionResult = await action.execute({ confirmation, ctx })
  } catch (error) {
    if (error instanceof AiAgentPermissionDeniedError) {
      await AiAgentConfirmation.query()
        .where('id', confirmation.id)
        .where('execution_token', executionToken)
        .update({ executionToken: null, executionStartedAt: null })
      throw new AiAgentConfirmationError(error.message, 403)
    }
    confirmation.status = 'failed'
    await confirmation.save()
    await appendConfirmationRuntimeDetail(
      confirmation,
      'failed',
      error instanceof Error ? error.message : undefined
    )
    throw new AiAgentConfirmationError(
      error instanceof Error ? error.message : '受控操作执行失败',
      409
    )
  }

  confirmation.status = 'confirmed'
  confirmation.confirmedAt = DateTime.now()
  confirmation.confirmedByUserId = input.userId
  await confirmation.save()
  await appendConfirmationRuntimeDetail(confirmation, 'confirmed')

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

export async function cancelAiAgentAction(
  ctx: HttpContext,
  input: {
    confirmationId: number
    conversationId: number
    userId: number
    source?: 'channel' | 'api'
  }
) {
  const confirmation = await AiAgentConfirmation.query()
    .where('id', input.confirmationId)
    .where('conversation_id', input.conversationId)
    .where('requested_by_user_id', input.userId)
    .first()
  if (!confirmation) throw new AiAgentConfirmationError('确认请求不存在', 404)
  if (confirmation.status !== 'pending') throw new AiAgentConfirmationError('确认请求已处理', 409)
  const cancelled = await AiAgentConfirmation.query()
    .where('id', confirmation.id)
    .where('status', 'pending')
    .whereNull('execution_token')
    .update({ status: 'cancelled', updatedAt: DateTime.now() })
  if (cancelled[0] !== 1) throw new AiAgentConfirmationError('确认请求已处理', 409)

  confirmation.status = 'cancelled'
  await appendConfirmationRuntimeDetail(confirmation, 'cancelled')
  await recordAuditEvent(ctx, {
    actorUserId: input.userId,
    action: 'agent.proposal_cancelled',
    targetType: confirmation.targetType ?? 'agent_action',
    targetId: confirmation.targetId,
    metadata: {
      action: confirmation.action,
      confirmationId: confirmation.id,
      source: input.source ?? 'channel',
    },
  })
  return serializeConfirmation(confirmation)
}
