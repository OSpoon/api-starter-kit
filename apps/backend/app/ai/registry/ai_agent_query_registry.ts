import { DateTime } from 'luxon'

import { ensureAiAgentPermission } from '#ai/core/ai_agent_authorization'
import { activeApiKeysQuery } from '#ai/queries/active_api_keys'
import { apiKeyProfileQuery } from '#ai/queries/api_key_profile'
import { managedUserProfileQuery } from '#ai/queries/managed_user_profile'
import { managedUsersQuery } from '#ai/queries/managed_users'
import { permissionCatalogQuery } from '#ai/queries/permission_catalog'
import { permissionUsageQuery } from '#ai/queries/permission_usage'
import { recentAccessControlChangesQuery } from '#ai/queries/recent_access_control_changes'
import { recentAuditLogsQuery } from '#ai/queries/recent_audit_logs'
import { roleProfileQuery } from '#ai/queries/role_profile'
import { rolesWithPermissionsQuery } from '#ai/queries/roles_with_permissions'
import { wecomMessagePreviewQuery } from '#ai/queries/wecom_message_preview'
import { wecomMessageTemplateProfileQuery } from '#ai/queries/wecom_message_template_profile'
import { wecomMessageTemplatesQuery } from '#ai/queries/wecom_message_templates'
import type { AiQueryTemplate, AiQueryTemplateCode } from '#ai/registry/ai_agent_query_types'
import AiAgentPendingQuery from '#models/ai_agent_pending_query'
import AuditLog from '#models/audit_log'

export type AiQueryParameter = import('#ai/registry/ai_agent_query_types').AiQueryParameter

export type AiRegisteredQueryResult =
  | { kind: 'query_error'; code: 'unknown_template' | 'invalid_input' | 'failed'; message: string }
  | {
      kind: 'missing_parameters'
      templateCode: AiQueryTemplateCode
      missingFields: Array<{ name: string; description: string }>
    }
  | { kind: 'query_result'; templateCode: AiQueryTemplateCode; rows: unknown[]; message?: string }

const queryTemplates: readonly AiQueryTemplate[] = [
  wecomMessageTemplatesQuery,
  wecomMessageTemplateProfileQuery,
  wecomMessagePreviewQuery,
  activeApiKeysQuery,
  apiKeyProfileQuery,
  managedUsersQuery,
  managedUserProfileQuery,
  recentAuditLogsQuery,
  rolesWithPermissionsQuery,
  roleProfileQuery,
  permissionCatalogQuery,
  permissionUsageQuery,
  recentAccessControlChangesQuery,
]

export const aiQueryTemplateCodes = queryTemplates.map((template) => template.code) as [
  AiQueryTemplateCode,
  ...AiQueryTemplateCode[],
]

export const aiQueryTemplateInstructions = queryTemplates
  .map((template) => `${template.code} (${template.description})`)
  .join('; ')

export function getAiQueryTemplate(code: string) {
  return queryTemplates.find((template) => template.code === code)
}

async function ensurePermission(userId: number, permission: string) {
  await ensureAiAgentPermission(userId, permission, '当前账号没有执行此查询的权限')
}

async function recordQueryAudit(input: {
  userId: number
  templateCode: string
  templateVersion?: number
  action: 'agent.query_executed' | 'agent.query_rejected' | 'agent.query_failed'
  authorization: 'allowed' | 'denied' | 'not_checked'
  reason?:
    | 'unknown_template'
    | 'permission_denied'
    | 'unsupported_parameters'
    | 'invalid_parameters'
    | 'execution_failed'
  parameterNames: string[]
  unknownParameterNames?: string[]
  resultCount?: number
  startedAt: number
}) {
  await AuditLog.create({
    actorUserId: input.userId,
    action: input.action,
    targetType: 'ai_query_template',
    targetId: input.templateCode,
    metadata: {
      ...(input.templateVersion === undefined ? {} : { templateVersion: input.templateVersion }),
      parameterNames: input.parameterNames,
      ...(input.unknownParameterNames?.length
        ? { unknownParameterNames: input.unknownParameterNames }
        : {}),
      ...(input.resultCount === undefined ? {} : { resultCount: input.resultCount }),
      authorization: input.authorization,
      ...(input.reason ? { reason: input.reason } : {}),
      durationMs: Math.round(performance.now() - input.startedAt),
    },
  })
}

function getMissingFields(template: AiQueryTemplate, params: Record<string, unknown>) {
  if (template.code === 'api_key_profile') {
    const hasId =
      (params.apiKeyId !== undefined && params.apiKeyId !== null) ||
      (params.id !== undefined && params.id !== null)
    const hasName = typeof params.name === 'string' && params.name.trim() !== ''
    return hasId || hasName ? [] : ['apiKeyIdOrName']
  }
  return Object.entries(template.parameters)
    .filter(([name, parameter]) => {
      const value = params[name]
      return (
        parameter.required &&
        (value === undefined || value === null || (typeof value === 'string' && !value.trim()))
      )
    })
    .map(([name]) => name)
}

function describeMissingFields(template: AiQueryTemplate, names: string[]) {
  return names.map((name) => ({
    name,
    description:
      name === 'apiKeyIdOrName'
        ? 'Required positive API Key ID or exact name.'
        : (template.parameters[name]?.description ?? 'Required parameter.'),
  }))
}

function parseParams(template: AiQueryTemplate, params: Record<string, unknown>) {
  const unknown = Object.keys(params).filter((name) => !(name in template.parameters))
  if (unknown.length) throw new Error(`不支持的查询参数：${unknown.join(', ')}`)
  const result: Record<string, unknown> = {}
  for (const [name, parameter] of Object.entries(template.parameters)) {
    const parsed = parameter.schema.safeParse(params[name])
    if (!parsed.success) throw new Error(`${name} 参数无效：${parameter.description}`)
    result[name] = parsed.data
  }
  return result
}

async function findActivePendingQuery(input: { conversationId: number; userId: number }) {
  const pending = await AiAgentPendingQuery.query()
    .where('conversation_id', input.conversationId)
    .where('requested_by_user_id', input.userId)
    .where('status', 'collecting_parameters')
    .orderBy('id', 'desc')
    .first()
  if (pending && pending.expiresAt <= DateTime.now()) {
    pending.status = 'expired'
    await pending.save()
    return null
  }
  return pending
}

export async function getPendingAiQueryContext(input: { conversationId: number; userId: number }) {
  const pending = await findActivePendingQuery(input)
  if (!pending) return ''
  const template = getAiQueryTemplate(pending.templateCode)
  const missingFields = template ? getMissingFields(template, pending.params) : []
  return ` <pending-query-context>${JSON.stringify({ templateCode: pending.templateCode, templateVersion: pending.templateVersion, collectedParameterNames: Object.keys(pending.params), missingRequired: missingFields, expiresAt: pending.expiresAt.toISO() })}</pending-query-context>`
}

export async function runRegisteredAiQuery(input: {
  conversationId: number
  userId: number
  templateCode: string
  params: Record<string, unknown>
}): Promise<AiRegisteredQueryResult> {
  const startedAt = performance.now()
  const template = getAiQueryTemplate(input.templateCode)
  if (!template) {
    await recordQueryAudit({
      userId: input.userId,
      templateCode: input.templateCode,
      action: 'agent.query_rejected',
      authorization: 'not_checked',
      reason: 'unknown_template',
      parameterNames: Object.keys(input.params),
      startedAt,
    })
    return { kind: 'query_error', code: 'unknown_template', message: '未知的查询模板' }
  }
  try {
    await ensurePermission(input.userId, template.permission)
  } catch (error) {
    await recordQueryAudit({
      userId: input.userId,
      templateCode: template.code,
      templateVersion: template.version,
      action: 'agent.query_rejected',
      authorization: 'denied',
      reason: 'permission_denied',
      parameterNames: Object.keys(input.params),
      startedAt,
    })
    throw error
  }
  const unknownParameters = Object.keys(input.params).filter(
    (name) => !(name in template.parameters)
  )
  if (unknownParameters.length) {
    await recordQueryAudit({
      userId: input.userId,
      templateCode: template.code,
      templateVersion: template.version,
      action: 'agent.query_rejected',
      authorization: 'allowed',
      reason: 'unsupported_parameters',
      parameterNames: Object.keys(input.params),
      unknownParameterNames: unknownParameters,
      startedAt,
    })
    return {
      kind: 'query_error',
      code: 'invalid_input',
      message: `不支持的查询参数：${unknownParameters.join(', ')}`,
    }
  }
  const active = await findActivePendingQuery({
    conversationId: input.conversationId,
    userId: input.userId,
  })
  if (active && active.templateCode !== template.code) {
    active.status = 'cancelled'
    await active.save()
  }
  const mergedParams =
    active?.templateCode === template.code ? { ...active.params, ...input.params } : input.params
  const missingFields = getMissingFields(template, mergedParams)
  if (missingFields.length) {
    if (template.persistParameters === false)
      return {
        kind: 'missing_parameters',
        templateCode: template.code,
        missingFields: describeMissingFields(template, missingFields),
      }
    const pending =
      active?.templateCode === template.code
        ? active
        : await AiAgentPendingQuery.create({
            conversationId: input.conversationId,
            requestedByUserId: input.userId,
            templateCode: template.code,
            templateVersion: template.version,
            params: {},
            status: 'collecting_parameters',
            expiresAt: DateTime.now().plus({ minutes: 15 }),
          })
    pending.merge({ params: mergedParams, expiresAt: DateTime.now().plus({ minutes: 15 }) })
    await pending.save()
    return {
      kind: 'missing_parameters',
      templateCode: template.code,
      missingFields: describeMissingFields(template, missingFields),
    }
  }
  let parsedParams: Record<string, unknown>
  try {
    parsedParams = parseParams(template, mergedParams)
  } catch (error) {
    await recordQueryAudit({
      userId: input.userId,
      templateCode: template.code,
      templateVersion: template.version,
      action: 'agent.query_rejected',
      authorization: 'allowed',
      reason: 'invalid_parameters',
      parameterNames: Object.keys(mergedParams),
      startedAt,
    })
    return {
      kind: 'query_error',
      code: 'invalid_input',
      message: error instanceof Error ? error.message : '查询未完成',
    }
  }
  let result: Record<string, unknown>
  try {
    result = await template.execute(parsedParams)
  } catch (error) {
    await recordQueryAudit({
      userId: input.userId,
      templateCode: template.code,
      templateVersion: template.version,
      action: 'agent.query_failed',
      authorization: 'allowed',
      reason: 'execution_failed',
      parameterNames: Object.keys(parsedParams),
      startedAt,
    })
    return {
      kind: 'query_error',
      code: 'failed',
      message: error instanceof Error ? error.message : '查询未完成',
    }
  }
  if (active?.templateCode === template.code) {
    active.status = 'executed'
    active.completedAt = DateTime.now()
    await active.save()
  }
  await recordQueryAudit({
    userId: input.userId,
    templateCode: template.code,
    templateVersion: template.version,
    action: 'agent.query_executed',
    authorization: 'allowed',
    parameterNames: Object.keys(parsedParams),
    resultCount: Array.isArray(result.rows) ? result.rows.length : 0,
    startedAt,
  })
  return {
    kind: 'query_result',
    templateCode: template.code,
    rows: Array.isArray(result.rows) ? result.rows : [],
    ...(typeof result.message === 'string' ? { message: result.message } : {}),
  }
}
