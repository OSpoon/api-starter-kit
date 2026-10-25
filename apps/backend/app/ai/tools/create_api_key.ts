import { z } from 'zod'

import type { AiAgentToolContext } from '#ai/core/ai_agent_tool_context'
import { type AiAgentToolSupport, createAiAgentTool } from '#ai/registry/ai_agent_tool_helpers'
import { piToolParameters } from '#ai/registry/ai_agent_tool_parameters'

export function createApiKeyCreationTool(_input: AiAgentToolContext, support: AiAgentToolSupport) {
  return createAiAgentTool(
    async ({ name, expiresIn }) =>
      support.executeManagedChange('create_api_key', 'create_api_key', { name, expiresIn }),
    {
      name: 'create_api_key',
      description:
        'Create an API Key using the exact name supplied by the user. The configured execution policy determines whether this runs directly or waits for the confirmation card. If the name is missing, ask instead of inventing one. expiresIn is optional and must be one of 30d, 90d, 180d, or long. Pass name and optional expiresIn as direct fields.',
      schema: z.object({
        name: z.string().trim().min(1).max(120),
        expiresIn: z.enum(['30d', '90d', '180d', 'long']).optional(),
      }),
      parameters: piToolParameters.apiKeyCreation,
      prepareConfirmation: ({ name, expiresIn }) =>
        support.prepareManagedChange('create_api_key', 'create_api_key', {
          name,
          expiresIn,
        }),
    }
  )
}
