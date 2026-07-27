import { Bouncer } from '@adonisjs/bouncer'
import { DateTime } from 'luxon'
import { z } from 'zod'

import { access } from '#abilities/main'
import AiAgentPendingQuery from '#models/ai_agent_pending_query'
import AuditLog from '#models/audit_log'
import Permission from '#models/permission'
import Role from '#models/role'
import User from '#models/user'
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
    | 'managed_users'
    | 'managed_user_profile'
    | 'recent_audit_logs'
    | 'role_profile'
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
  .map((template) => `${template.code}: ${template.description}`)
  .join(' ')

export function getAiQueryTemplate(code: string) {
  return queryTemplates.find((template) => template.code === code)
}

async function ensurePermission(userId: number, permission: PermissionCode) {
  const user = await User.findOrFail(userId)
  const bouncer = new Bouncer(() => user, { access })
  if (!(await bouncer.allows('access', permission))) throw new Error('当前账号没有执行此查询的权限')
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
  return ` <pending-query-context>${JSON.stringify({
    templateCode: pending.templateCode,
    templateVersion: pending.templateVersion,
    collectedParameterNames: Object.keys(pending.params),
    missingRequired: pending.missingFields,
    expiresAt: pending.expiresAt.toISO(),
  })}</pending-query-context>`
}

export async function runRegisteredAiQuery(input: {
  conversationId: number
  userId: number
  templateCode: string
  params: Record<string, unknown>
}): Promise<AiRegisteredQueryResult> {
  const template = getAiQueryTemplate(input.templateCode)
  if (!template) return { kind: 'query_error', message: '未知的查询模板' }
  const startedAt = performance.now()
  await ensurePermission(input.userId, template.permission)

  const unknownParameters = Object.keys(input.params).filter(
    (name) => !(name in template.parameters)
  )
  if (unknownParameters.length) {
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
            missingFields: [],
            status: 'collecting_parameters',
            expiresAt: DateTime.now().plus({ minutes: 15 }),
          })
    pending.merge({
      params: mergedParams,
      missingFields,
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

  try {
    const parsedParams = parseParams(template, mergedParams)
    const result = await template.execute(parsedParams)
    if (active?.templateCode === template.code) {
      active.status = 'executed'
      active.completedAt = DateTime.now()
      active.missingFields = []
      await active.save()
    }
    await AuditLog.create({
      actorUserId: input.userId,
      action: 'agent.query_executed',
      targetType: 'ai_query_template',
      targetId: template.code,
      metadata: {
        templateVersion: template.version,
        parameterNames: Object.keys(parsedParams),
        resultCount: Array.isArray(result.rows) ? result.rows.length : 0,
        authorization: 'allowed',
        durationMs: Math.round(performance.now() - startedAt),
      },
    })
    return {
      kind: 'query_result',
      templateCode: template.code,
      rows: Array.isArray(result.rows) ? result.rows : [],
      ...(typeof result.message === 'string' ? { message: result.message } : {}),
    }
  } catch (error) {
    return { kind: 'query_error', message: error instanceof Error ? error.message : '查询未完成' }
  }
}
