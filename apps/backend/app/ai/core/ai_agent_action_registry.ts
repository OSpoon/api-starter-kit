import type { HttpContext } from '@adonisjs/core/http'

import { accessControlActions } from '#ai/actions/access_control_actions'
import { aiAgentBuiltInToolActions } from '#ai/actions/ai_agent_builtin_tool_actions'
import { aiAgentMcpActions } from '#ai/actions/ai_agent_mcp_actions'
import { apiKeyActions } from '#ai/actions/api_key_actions'
import { userActions } from '#ai/actions/user_actions'
import { wecomMessageActions } from '#ai/actions/wecom_message_actions'
import type { AiAgentActionDefinition, AiAgentActionName } from '#ai/core/ai_agent_action_contracts'
import { getAiAgentActor } from '#ai/core/ai_agent_action_helpers'
import { ensureAiAgentPermission } from '#ai/core/ai_agent_authorization'
import type { AiAgentCredentialDisclosure } from '#ai/core/ai_agent_tool_context'
import AiAgentConfirmation from '#models/ai_agent_confirmation'
import { recordAuditEvent } from '#services/audit_log'

export {
  type AiAgentActionChangeSummary,
  type AiAgentActionDefinition,
  type AiAgentActionImpact,
  type AiAgentActionName,
  aiAgentActionNames,
  type AiAgentActionPreparation,
  aiAgentChangeSchema,
  aiApiKeyChangeSchema,
  genericProposalActionNames,
} from '#ai/core/ai_agent_action_contracts'

const aiAgentActions = {
  ...apiKeyActions,
  ...userActions,
  ...accessControlActions,
  ...wecomMessageActions,
  ...aiAgentBuiltInToolActions,
  ...aiAgentMcpActions,
} satisfies Record<AiAgentActionName, AiAgentActionDefinition>

export async function executeAiAgentActionImmediately(input: {
  action: string
  actionInput: Record<string, unknown>
  ctx: HttpContext
  onCredentialDisclosure?: (credential: AiAgentCredentialDisclosure) => void | Promise<void>
}) {
  const action = getAiAgentAction(input.action)
  if (!action) throw new Error('不支持的 Agent 操作')
  const actor = getAiAgentActor(input.ctx)
  await ensureAiAgentPermission(actor.id, action.permission)
  const preparation = await action.prepare(input.actionInput, actor.id)
  let result: Record<string, unknown> | void
  const confirmation = new AiAgentConfirmation()
  confirmation.payload = preparation.payload
  try {
    result = await action.execute({ confirmation, ctx: input.ctx })
    await recordAuditEvent(input.ctx, {
      actorUserId: actor.id,
      source: 'ai_agent',
      outcome: 'success',
      action: 'agent.action_executed_directly',
      targetType: preparation.targetType,
      targetId: preparation.targetId,
      metadata: { action: input.action },
    })
  } catch (error) {
    await recordAuditEvent(input.ctx, {
      actorUserId: actor.id,
      source: 'ai_agent',
      outcome: 'failure',
      reasonCode: 'direct_agent_action_failed',
      action: 'agent.action_executed_directly',
      targetType: preparation.targetType,
      targetId: preparation.targetId,
      metadata: { action: input.action },
    })
    throw error
  }
  if (!result) return undefined
  const safeResult = { ...result }
  if ('credential' in safeResult) {
    const credential = safeResult.credential
    delete safeResult.credential
    if (credential && typeof credential === 'object') {
      const value = credential as Record<string, unknown>
      if (
        (value.kind === 'api_key' || value.kind === 'password') &&
        typeof value.value === 'string' &&
        typeof value.label === 'string'
      ) {
        await input.onCredentialDisclosure?.({
          kind: value.kind,
          value: value.value,
          label: value.label,
        })
        safeResult.credentialCreated = { kind: value.kind, label: value.label }
      }
    }
  }
  return safeResult
}

export function getAiAgentAction(action: string) {
  return aiAgentActions[action as AiAgentActionName] ?? null
}

export async function ensureAiAgentActionPermission(userId: number, actionName: string) {
  const action = getAiAgentAction(actionName)
  if (!action) throw new Error('不支持的 Agent 操作')
  await ensureAiAgentPermission(userId, action.permission)
}

/** Returns a domain-defined, non-sensitive preview for the confirmation UI. */
export function getAiAgentActionChangeSummary(action: string, payload: Record<string, unknown>) {
  return getAiAgentAction(action)?.summarize(payload) ?? []
}
