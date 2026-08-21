import { aiApiKeyChangeSchema } from '#ai/core/ai_agent_action_registry'
import type { AiAgentToolContext } from '#ai/core/ai_agent_tool_context'
import { type AiAgentToolSupport, createAiAgentTool } from '#ai/registry/ai_agent_tool_helpers'
import { piToolParameters } from '#ai/registry/ai_agent_tool_parameters'

export function createProposeApiKeyRevocationTool(
  _input: AiAgentToolContext,
  support: AiAgentToolSupport
) {
  return createAiAgentTool(
    async (actionInput) => support.proposeManagedChange('revoke_api_key', actionInput),
    {
      name: 'propose_api_key_revocation',
      description:
        'Prepare a proposal to revoke (invalidate) an active API Key. Never execute it: the structured confirmation card is required. Pass exactly one target field: apiKeyId, id, or name. Reuse the exact name or ID already supplied anywhere in the current conversation; if the latest user message supplies the name, pass it directly and never ask for it again or call this tool without that field. Never invent a target. The key must still be active; verify the key and its status before proposing when an ID is available. Already-revoked keys must use propose_api_key_deletion instead.',
      schema: aiApiKeyChangeSchema,
      parameters: piToolParameters.apiKeyTarget,
    }
  )
}
