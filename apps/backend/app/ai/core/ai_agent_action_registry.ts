import { accessControlActions } from '#ai/actions/access_control_actions'
import { apiKeyActions } from '#ai/actions/api_key_actions'
import { userActions } from '#ai/actions/user_actions'
import { wecomMessageActions } from '#ai/actions/wecom_message_actions'
import type { AiAgentActionDefinition, AiAgentActionName } from '#ai/core/ai_agent_action_contracts'

export {
  AiAgentActionAuthorizationError,
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
} satisfies Record<AiAgentActionName, AiAgentActionDefinition>

export function getAiAgentAction(action: string) {
  return aiAgentActions[action as AiAgentActionName] ?? null
}

/** Returns a domain-defined, non-sensitive preview for the confirmation UI. */
export function getAiAgentActionChangeSummary(action: string, payload: Record<string, unknown>) {
  return getAiAgentAction(action)?.summarize(payload) ?? []
}
