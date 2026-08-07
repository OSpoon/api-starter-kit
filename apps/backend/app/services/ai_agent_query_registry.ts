import { DateTime } from 'luxon'
import { z } from 'zod'

import AiAgentPendingQuery from '#models/ai_agent_pending_query'
import ApiKey from '#models/api_key'
import AuditLog from '#models/audit_log'
import Permission from '#models/permission'
import Role from '#models/role'
import User from '#models/user'
import { ensureAiAgentPermission } from '#services/ai_agent_authorization'
import type { PermissionCode } from '#services/permission_catalog'

export type AiQueryParameter = {
  description: string
  required?: boolean
  schema: z.ZodTypeAny
}

export type AiRegisteredQueryResult =
  | { kind: 'query_error'; message: string }
  | {
      kind: 'missing_parameters'
      templateCode: AiQueryTemplate['code']
      missingFields: Array<{ name: string; description: string }>
    }
  | {
      kind: 'query_result'
      templateCode: AiQueryTemplate['code']
      rows: unknown[]
      message?: string
    }

type AiQueryTemplate = {
  code:
    | 'active_api_keys'
    | 'managed_users'
    | 'managed_user_profile'
    | 'recent_audit_logs'
    | 'roles_with_permissions'
    | 'role_profile'
    | 'permission_catalog'
    | 'permission_usage'
    | 'recent_access_control_changes'
  version: number
  description: string
  permission: PermissionCode
  parameters: Record<string, AiQueryParameter>
  execute: (params: Record<string, unknown>) => Promise<Record<string, unknown>>
}

const maxRows = 50

function maskEmail(email: string) {
  const [local, domain] = email.split('@')
  if (!domain) return '[redacted]'
  return `${local.slice(0, 1)}***@${domain}`
}

function maskName(name: string) {
  return name.length <= 1 ? '*' : `${name.slice(0, 1)}*`
}

const queryTemplates: readonly AiQueryTemplate[] = [
  {
    code: 'active_api_keys',
    version: 1,
    description: 'List up to 50 active API Key metadata without secret values.',
    permission: 'api-keys:read',
    parameters: {},
    async execute() {
      const keys = await ApiKey.query()
        .whereNull('revoked_at')
        .orderBy('created_at', 'desc')
        .limit(50)
      return {
        rows: keys.map((key) => ({
          id: key.id,
          name: key.name,
          prefix: key.prefix,
          expiresAt: key.expiresAt?.toISO() ?? null,
          lastUsedAt: key.lastUsedAt?.toISO() ?? null,
        })),
      }
    },
  },
  {
    code: 'managed_users',
    version: 1,
    description: 'List up to 50 managed users with masked personal information and their roles.',
    permission: 'users:read',
    parameters: {
      limit: {
        description: 'Maximum number of users to return, from 1 to 50. Defaults to 50.',
        schema: z.number().int().min(1).max(maxRows).default(maxRows),
      },
    },
    async execute(params) {
      const users = await User.query()
        .preload('roles')
        .orderBy('id')
        .limit(params.limit as number)
      return {
        rows: users.map((user) => ({
          id: user.id,
          fullName: maskName(user.fullName ?? ''),
          email: maskEmail(user.email),
          twoFactorEnabled: user.twoFactorEnabled,
          roles: user.roles.map((role) => ({ id: role.id, code: role.code, name: role.name })),
        })),
      }
    },
  },
  {
    code: 'managed_user_profile',
    version: 1,
    description: 'Look up one managed user by ID. Ask for userId when it was not supplied.',
    permission: 'users:read',
    parameters: {
      userId: {
        description: 'Required positive managed-user ID.',
        required: true,
        // Tool calls produced from conversational text commonly encode IDs as
        // strings. Coercion is safe here because the integer and positivity
        // constraints remain authoritative.
        schema: z.coerce.number().int().positive(),
      },
    },
    async execute(params) {
      const user = await User.query()
        .where('id', params.userId as number)
        .preload('roles')
        .first()
      if (!user) return { rows: [], message: 'No managed user matched that ID.' }
      return {
        rows: [
          {
            id: user.id,
            fullName: maskName(user.fullName ?? ''),
            email: maskEmail(user.email),
            twoFactorEnabled: user.twoFactorEnabled,
            disabled: Boolean(user.disabledAt),
            roles: user.roles.map((role) => ({ id: role.id, code: role.code, name: role.name })),
          },
        ],
      }
    },
  },
  {
    code: 'recent_audit_logs',
    version: 1,
    description:
      'List recent audit events without IP addresses, user agents, or unredacted actor email addresses.',
    permission: 'audit-logs:read',
    parameters: {
      limit: {
        description: 'Maximum number of audit events to return, from 1 to 50. Defaults to 30.',
        schema: z.number().int().min(1).max(maxRows).default(30),
      },
    },
    async execute(params) {
      const logs = await AuditLog.query()
        .preload('actor')
        .orderBy('id', 'desc')
        .limit(params.limit as number)
      return {
        rows: logs.map((log) => ({
          id: log.id,
          action: log.action,
          targetType: log.targetType,
          targetId: log.targetId,
          // Metadata is deliberately excluded: it can contain business identifiers.
          createdAt: log.createdAt.toISO(),
          actor: log.actor
            ? { id: log.actor.id, fullName: maskName(log.actor.fullName ?? '') }
            : null,
        })),
      }
    },
  },
  {
    code: 'roles_with_permissions',
    version: 1,
    description: 'List up to 100 roles with their assigned permissions and user counts.',
    permission: 'roles:read',
    parameters: {},
    async execute() {
      const roles = await Role.query()
        .preload('permissions', (query) => query.orderBy('code').limit(200))
        .withCount('users')
        .orderBy('is_system', 'desc')
        .orderBy('name')
        .limit(100)
      return {
        rows: roles.map((role) => ({
          id: role.id,
          code: role.code,
          name: role.name,
          description: role.description,
          isSystem: role.isSystem,
          userCount: Number(role.$extras.users_count ?? 0),
          permissions: role.permissions.map((permission) => ({
            id: permission.id,
            code: permission.code,
            name: permission.name,
          })),
        })),
      }
    },
  },
  {
    code: 'role_profile',
    version: 1,
    description: 'Look up one role by its stable code with assigned permissions and user count.',
    permission: 'roles:read',
    parameters: {
      roleCode: {
        description: 'Required stable role code, for example editor.',
        required: true,
        schema: z.string().trim().min(1).max(120),
      },
    },
    async execute(params) {
      const role = await Role.query()
        .where('code', params.roleCode as string)
        .preload('permissions', (query) => query.orderBy('code'))
        .withCount('users')
        .first()
      if (!role) return { rows: [], message: 'No role matched that code.' }
      return {
        rows: [
          {
            id: role.id,
            code: role.code,
            name: role.name,
            description: role.description,
            isSystem: role.isSystem,
            userCount: Number(role.$extras.users_count ?? 0),
            permissions: role.permissions.map((permission) => ({
              id: permission.id,
              code: permission.code,
              name: permission.name,
              groupName: permission.groupName,
            })),
          },
        ],
      }
    },
  },
  {
    code: 'permission_catalog',
    version: 1,
    description: 'List up to 200 permission catalog entries with role reference counts.',
    permission: 'permissions:read',
    parameters: {},
    async execute() {
      const permissions = await Permission.query()
        .withCount('roles')
        .orderBy('group_name')
        .orderBy('code')
        .limit(200)
      return {
        rows: permissions.map((permission) => ({
          id: permission.id,
          code: permission.code,
          name: permission.name,
          groupName: permission.groupName,
          description: permission.description,
          isSystem: permission.isSystem,
          roleCount: Number(permission.$extras.roles_count ?? 0),
        })),
      }
    },
  },
  {
    code: 'permission_usage',
    version: 1,
    description: 'Look up one permission by its stable code and the roles that currently use it.',
    permission: 'permissions:read',
    parameters: {
      permissionCode: {
        description: 'Required stable permission code, for example users:read.',
        required: true,
        schema: z.string().trim().min(3).max(120),
      },
    },
    async execute(params) {
      const permission = await Permission.query()
        .where('code', params.permissionCode as string)
        .preload('roles', (query) => query.orderBy('code'))
        .first()
      if (!permission) return { rows: [], message: 'No permission matched that code.' }
      return {
        rows: [
          {
            id: permission.id,
            code: permission.code,
            name: permission.name,
            groupName: permission.groupName,
            description: permission.description,
            isSystem: permission.isSystem,
            roles: permission.roles.map((role) => ({
              id: role.id,
              code: role.code,
              name: role.name,
              isSystem: role.isSystem,
            })),
          },
        ],
      }
    },
  },
  {
    code: 'recent_access_control_changes',
    version: 1,
    description:
      'List recent role and permission create, update, and delete audit events without metadata or unredacted actor details.',
    permission: 'audit-logs:read',
    parameters: {
      limit: {
        description: 'Maximum number of events to return, from 1 to 50. Defaults to 30.',
        schema: z.number().int().min(1).max(maxRows).default(30),
      },
    },
    async execute(params) {
      const logs = await AuditLog.query()
        .whereIn('action', [
          'role.created',
          'role.updated',
          'role.deleted',
          'permission.created',
          'permission.updated',
          'permission.deleted',
        ])
        .preload('actor')
        .orderBy('id', 'desc')
        .limit(params.limit as number)
      return {
        rows: logs.map((log) => ({
          id: log.id,
          action: log.action,
          targetType: log.targetType,
          targetId: log.targetId,
          createdAt: log.createdAt.toISO(),
          actor: log.actor
            ? { id: log.actor.id, fullName: maskName(log.actor.fullName ?? '') }
            : null,
        })),
      }
    },
  },
]

export const aiQueryTemplateCodes = queryTemplates.map((template) => template.code) as [
  AiQueryTemplate['code'],
  ...AiQueryTemplate['code'][],
]

export const aiQueryTemplateInstructions = queryTemplates
  .map((template) => `${template.code} (${template.description})`)
  .join('; ')

export function getAiQueryTemplate(code: string) {
  return queryTemplates.find((template) => template.code === code)
}

async function ensurePermission(userId: number, permission: PermissionCode) {
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
  return ` <pending-query-context>${JSON.stringify({
    templateCode: pending.templateCode,
    templateVersion: pending.templateVersion,
    collectedParameterNames: Object.keys(pending.params),
    missingRequired: missingFields,
    expiresAt: pending.expiresAt.toISO(),
  })}</pending-query-context>`
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
    return { kind: 'query_error', message: '未知的查询模板' }
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
    return { kind: 'query_error', message: `不支持的查询参数：${unknownParameters.join(', ')}` }
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
    pending.merge({
      params: mergedParams,
      expiresAt: DateTime.now().plus({ minutes: 15 }),
    })
    await pending.save()
    return {
      kind: 'missing_parameters',
      templateCode: template.code,
      missingFields: missingFields.map((name) => ({
        name,
        description: template.parameters[name].description,
      })),
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
    return { kind: 'query_error', message: error instanceof Error ? error.message : '查询未完成' }
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
    return { kind: 'query_error', message: error instanceof Error ? error.message : '查询未完成' }
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
