import { aiApiKeyChangeSchema } from '#ai/core/ai_agent_action_contracts'
import type { AiAgentToolContext } from '#ai/core/ai_agent_tool_context'
import { type AiAgentToolSupport, createAiAgentTool } from '#ai/registry/ai_agent_tool_helpers'
import { piToolParameters } from '#ai/registry/ai_agent_tool_parameters'

export function createApiKeyRevocationTool(
  _input: AiAgentToolContext,
  support: AiAgentToolSupport
) {
  return createAiAgentTool(
    async (actionInput) =>
      support.executeManagedChange('revoke_api_key', 'revoke_api_key', actionInput),
    {
      name: 'revoke_api_key',
      description:
        'Revoke an active API Key. When the user supplies its exact name or ID, pass that target directly; the server resolves it and checks its current state before the configured execution policy runs. Do not substitute a similar key or first use active_api_keys for a named key. Pass exactly one target field: apiKeyId, id, or name. Already-revoked keys must use delete_api_key instead.',
      schema: aiApiKeyChangeSchema,
      parameters: piToolParameters.apiKeyTarget,
      prepareConfirmation: (actionInput) =>
        support.prepareManagedChange('revoke_api_key', 'revoke_api_key', actionInput),
    }
  )
}
