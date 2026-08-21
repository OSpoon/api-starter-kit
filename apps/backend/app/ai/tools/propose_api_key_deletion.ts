import { aiApiKeyChangeSchema } from '#ai/core/ai_agent_action_registry'
import type { AiAgentToolContext } from '#ai/core/ai_agent_tool_context'
import { type AiAgentToolSupport, createAiAgentTool } from '#ai/registry/ai_agent_tool_helpers'
import { piToolParameters } from '#ai/registry/ai_agent_tool_parameters'

export function createProposeApiKeyDeletionTool(
  _input: AiAgentToolContext,
  support: AiAgentToolSupport
) {
  return createAiAgentTool(
    async (actionInput) => support.proposeManagedChange('delete_api_key', actionInput),
    {
      name: 'propose_api_key_deletion',
      description:
        'Prepare a proposal to permanently delete an API Key that is already revoked. Never execute it: the structured confirmation card is required. Pass exactly one target field: apiKeyId, id, or name. Reuse the exact name or ID already supplied anywhere in the current conversation; if the latest user message supplies the name, pass it directly and never ask for it again or call this tool without that field. Never invent a target. The key must already be revoked; active keys must use propose_api_key_revocation first.',
      schema: aiApiKeyChangeSchema,
      parameters: piToolParameters.apiKeyTarget,
    }
  )
}
