import type { HttpContext } from '@adonisjs/core/http'

import {
  AiAgentActionAuthorizationError,
  type AiAgentActionChangeSummary,
  type AiAgentActionDefinition,
  type AiAgentActionImpact,
  type AiAgentActionImplementation,
} from '#ai/core/ai_agent_action_contracts'
import { ensureAiAgentPermission } from '#ai/core/ai_agent_authorization'

export function defineAiAgentAction(
  implementation: AiAgentActionImplementation,
  metadata: {
    impact: AiAgentActionImpact
    summarize: (payload: Record<string, unknown>) => AiAgentActionChangeSummary
  }
): AiAgentActionDefinition {
  return { ...implementation, ...metadata }
}

export async function ensurePermission(ctx: HttpContext, permission: string) {
  const user = ctx.auth.getUserOrFail()
  try {
    await ensureAiAgentPermission(user.id, permission)
  } catch {
    throw new AiAgentActionAuthorizationError('当前账号没有执行此操作的权限')
  }
  return user
}

export function integer(input: Record<string, unknown>, name: string, aliases: string[] = []) {
  const value = [input[name], ...aliases.map((alias) => input[alias])].find(
    (candidate) => candidate !== undefined && candidate !== null
  )
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value.trim())
        : Number.NaN
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} 无效`)
  }
  return parsed
}

export function string(input: Record<string, unknown>, name: string, maxLength: number) {
  const value = input[name]
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new Error(`${name} 无效`)
  }
  return value.trim()
}

export function optionalDescription(input: Record<string, unknown>) {
  const value = input.description
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || value.trim().length > 1000) throw new Error('description 无效')
  return value.trim() || null
}

export function summaryValue(payload: Record<string, unknown>, key: string) {
  const value = payload[key]
  if (Array.isArray(value)) return value.join(', ')
  if (value === null || value === undefined || value === '') return 'not_set'
  return String(value)
}
