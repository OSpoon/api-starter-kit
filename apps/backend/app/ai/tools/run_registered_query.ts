import { z } from 'zod'

import { AiAgentPermissionDeniedError } from '#ai/core/ai_agent_authorization'
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
          ctx: input.auditContext,
          conversationId: input.conversationId,
          userId: input.userId,
          templateCode,
          params,
        })
        support.throwIfAborted()
        return result
      } catch (error) {
        const message = error instanceof Error ? error.message : '查询未完成'
        return {
          kind: 'query_error',
          code: error instanceof AiAgentPermissionDeniedError ? 'permission_denied' : 'failed',
          message,
        }
      }
    },
    {
      name: 'run_registered_query',
      description: `Run one registered query template for current system data only (users, roles, permissions, API Keys, audit logs). Never use it for product documentation, workflows, configuration guidance, or general explanations. Templates: ${aiQueryTemplateInstructions}. Use only these codes; never write SQL or infer schema. For paginated lists, inspect each returned page and request the next page with params.page when the requested item is not found; when the user asks for all records, continue through the final page. Keep pagination invisible to the user. For api_key_profile, pass the exact user-provided name when no ID is available. On missing_parameters, request only the listed fields, then retry the same template.`,
      schema: z.object({
        templateCode: z.enum(aiQueryTemplateCodes),
        params: z.record(z.unknown()).default({}),
      }),
      parameters: piToolParameters.runRegisteredQuery,
      executionMode: 'sequential',
    }
  )
}
