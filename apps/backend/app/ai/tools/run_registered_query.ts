import { z } from 'zod'

import type { AiAgentToolContext } from '#ai/core/ai_agent_tool_context'
import {
  aiQueryTemplateCodes,
  aiQueryTemplateInstructions,
  ensureRegisteredAiQueryPermission,
  runRegisteredAiQuery,
  validateRegisteredAiQueryParameters,
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
          code: 'failed',
          message,
        }
      }
    },
    {
      name: 'run_registered_query',
      description: `The only tool for current system data (users, roles, permissions, API Keys, audit logs) is run_registered_query. Template codes, including api_key_profile, are values for its templateCode argument; never call a template code as a separate tool. Never use this tool for product documentation, workflows, configuration guidance, or general explanations. Templates: ${aiQueryTemplateInstructions}. Use only these codes; never write SQL or infer schema. For paginated lists, inspect each returned page and request the next page with params.page when the requested item is not found; when the user asks for all records, continue through the final page. Keep pagination invisible to the user. For a specific managed user, use managed_user_profile with exactly one of userId, exact email, or exact fullName; treat its match.status and match.field as authoritative, and do not infer a failed match from masked name or email fields. If an exact name matches more than one user, ask the user to choose by ID. Use IDs from managed_users as stable targets. If the user wants to delete an API Key but has not identified it, use revoked_api_keys to list deletion candidates; never conclude a revoked key does not exist from active_api_keys results. For a specific API Key named by the user, use templateCode api_key_profile and pass the exact name under params.name, leaving apiKeyId/id unset; this also includes revoked keys. Do not use active_api_keys for a named key. On missing_parameters, request only the listed fields, then retry the same template.`,
      schema: z.object({
        templateCode: z.enum(aiQueryTemplateCodes),
        params: z.record(z.unknown()).default({}),
      }),
      parameters: piToolParameters.runRegisteredQuery,
      prepareConfirmation: async ({ templateCode, params }) => {
        validateRegisteredAiQueryParameters(templateCode, params)
        await ensureRegisteredAiQueryPermission(templateCode, input.userId)
        return support.prepareManagedChange('run_registered_query', 'call_builtin_tool', {
          toolName: 'run_registered_query',
          arguments: { templateCode, params },
          knowledgeCatalogDocumentIds: [...(input.knowledgeCatalogDocumentIds ?? [])],
        })
      },
      executionMode: 'sequential',
    }
  )
}
