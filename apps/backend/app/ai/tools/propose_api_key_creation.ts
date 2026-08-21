import { z } from 'zod'

import type { AiAgentToolContext } from '#ai/core/ai_agent_tool_context'
import { type AiAgentToolSupport, createAiAgentTool } from '#ai/registry/ai_agent_tool_helpers'
import { piToolParameters } from '#ai/registry/ai_agent_tool_parameters'

export function createProposeApiKeyCreationTool(
  _input: AiAgentToolContext,
  support: AiAgentToolSupport
) {
  return createAiAgentTool(
    async ({ name, expiresIn }) =>
      support.proposeManagedChange('create_api_key', { name, expiresIn }),
    {
      name: 'propose_api_key_creation',
      description:
        'When the user requests API Key creation, call this tool before replying; never claim that a proposal or confirmation card exists without a successful tool result. Prepare a proposal to create a new API Key. The name is required and must be exactly supplied by the user; if the user has not supplied a name, ask for it instead of inventing a default name. If the conversation contains a pending creation proposal and the user wants to replace it, treat the old item as an unexecuted proposal, not an existing API Key. expiresIn is optional and must be one of 30d, 90d, 180d, or long. Never execute it directly: the structured confirmation card is required. Do not wrap arguments in action or input; pass name and optional expiresIn as direct fields.',
      schema: z.object({
        name: z.string().trim().min(1).max(120),
        expiresIn: z.enum(['30d', '90d', '180d', 'long']).optional(),
      }),
      parameters: piToolParameters.apiKeyCreation,
    }
  )
}
