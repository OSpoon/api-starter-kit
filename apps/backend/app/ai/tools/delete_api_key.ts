import { aiApiKeyChangeSchema } from '#ai/core/ai_agent_action_contracts'
import type { AiAgentToolContext } from '#ai/core/ai_agent_tool_context'
import { type AiAgentToolSupport, createAiAgentTool } from '#ai/registry/ai_agent_tool_helpers'
import { piToolParameters } from '#ai/registry/ai_agent_tool_parameters'

export function createApiKeyDeletionTool(_input: AiAgentToolContext, support: AiAgentToolSupport) {
  return createAiAgentTool(
    async (actionInput) =>
      support.executeManagedChange('delete_api_key', 'delete_api_key', actionInput),
    {
      name: 'delete_api_key',
      description:
        'Permanently delete an API Key that is already revoked. If the user wants to delete a key but has not identified which one, first call run_registered_query with templateCode revoked_api_keys and show the returned candidates. When the user names a key, call this tool with that exact name; it resolves the exact target and checks its status before the configured execution policy runs. Pass exactly one target field: apiKeyId, id, or name. Never substitute a similarly named key or invent a target. Active keys must use revoke_api_key first.',
      schema: aiApiKeyChangeSchema,
      parameters: piToolParameters.apiKeyTarget,
      prepareConfirmation: (actionInput) =>
        support.prepareManagedChange('delete_api_key', 'delete_api_key', actionInput),
    }
  )
}
