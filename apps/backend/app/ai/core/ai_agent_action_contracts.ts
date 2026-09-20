import type { HttpContext } from '@adonisjs/core/http'
import { z } from 'zod'

import type AiAgentConfirmation from '#models/ai_agent_confirmation'

export const aiAgentActionNames = [
  'revoke_api_key',
  'delete_api_key',
  'create_api_key',
  'reset_user_password',
  'disable_user',
  'enable_user',
  'update_user',
  'delete_user',
  'create_role',
  'update_role',
  'delete_role',
  'create_permission',
  'update_permission',
  'delete_permission',
  'send_wecom_message',
] as const

export type AiAgentActionName = (typeof aiAgentActionNames)[number]

export const genericProposalActionNames = [
  'reset_user_password',
  'disable_user',
  'enable_user',
  'update_user',
  'delete_user',
  'create_role',
  'update_role',
  'delete_role',
  'create_permission',
  'update_permission',
  'delete_permission',
] as const satisfies readonly AiAgentActionName[]

export type AiAgentActionPreparation = {
  targetType: string
  targetId: string
  targetSummary: Record<string, unknown>
  payload: Record<string, unknown>
}

export type AiAgentActionImpact = 'standard' | 'destructive'

export type AiAgentActionChangeSummary = Array<{ field: string; value: string }>

export type AiAgentActionDefinition = {
  permission: string
  impact: AiAgentActionImpact
  prepare: (input: Record<string, unknown>) => Promise<AiAgentActionPreparation>
  execute: (input: {
    confirmation: AiAgentConfirmation
    ctx: HttpContext
  }) => Promise<Record<string, unknown> | void>
  summarize: (payload: Record<string, unknown>) => AiAgentActionChangeSummary
}

export type AiAgentActionImplementation = Omit<AiAgentActionDefinition, 'impact' | 'summarize'>

export class AiAgentActionAuthorizationError extends Error {}

// API Key revocation and deletion use dedicated proposal tools so the model's
// choice between those security-sensitive operations stays explicit.
export const aiAgentChangeSchema = z.object({
  action: z.enum(genericProposalActionNames),
  input: z
    .record(z.unknown())
    .refine((value) => Object.keys(value).length > 0, '受控操作缺少必要参数'),
})

// Shared schema for the dedicated API Key revocation and deletion tools.
export const aiApiKeyChangeSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value
    const directInput = value as Record<string, unknown>
    const nested =
      directInput.input &&
      typeof directInput.input === 'object' &&
      !Array.isArray(directInput.input)
        ? (directInput.input as Record<string, unknown>)
        : {}
    return { ...nested, ...directInput }
  },
  z
    .object({
      apiKeyId: z.coerce.number().int().positive().optional(),
      id: z.coerce.number().int().positive().optional(),
      name: z.string().trim().min(1).max(120).optional(),
    })
    .refine(
      (input) =>
        [input.apiKeyId, input.id, input.name].filter((value) => value !== undefined).length === 1,
      '请将 API Key 的正整数 ID 或精确名称作为工具参数传入（二选一）'
    )
)
