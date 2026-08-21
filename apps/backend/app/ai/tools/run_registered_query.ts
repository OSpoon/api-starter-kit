import { z } from 'zod'

import type { AiAgentToolContext } from '#ai/core/ai_agent_tool_context'
import {
  aiQueryTemplateCodes,
  aiQueryTemplateInstructions,
  runRegisteredAiQuery,
} from '#ai/registry/ai_agent_query_registry'
import { type AiAgentToolSupport, createAiAgentTool } from '#ai/registry/ai_agent_tool_helpers'
import { piToolParameters } from '#ai/registry/ai_agent_tool_parameters'

export function createRunRegisteredQueryTool(
  input: AiAgentToolContext,
  support: AiAgentToolSupport
) {
  return createAiAgentTool(
    async ({ templateCode, params }) => {
      try {
        support.throwIfAborted()
        const result = await runRegisteredAiQuery({
          conversationId: input.conversationId,
          userId: input.userId,
          templateCode,
          params,
        })
        support.throwIfAborted()
        return result
      } catch (error) {
        return {
          kind: 'query_error',
          code: 'failed',
          message: error instanceof Error ? error.message : '查询未完成',
        }
      }
    },
    {
      name: 'run_registered_query',
      description: `Run one registered query template for current system data only (users, roles, permissions, API Keys, audit logs). Never use it for product documentation, workflows, configuration guidance, or general explanations. Templates: ${aiQueryTemplateInstructions}. Use only these codes; never write SQL or infer schema. For api_key_profile, pass the exact user-provided name when no ID is available. On missing_parameters, request only the listed fields, then retry the same template.`,
      schema: z.object({
        templateCode: z.enum(aiQueryTemplateCodes),
        params: z.record(z.unknown()).default({}),
      }),
      parameters: piToolParameters.runRegisteredQuery,
      executionMode: 'parallel',
    }
  )
}
