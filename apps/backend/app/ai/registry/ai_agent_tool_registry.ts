import type { AgentTool } from '@earendil-works/pi-agent-core'

import { proposeAiAgentAction } from '#ai/core/ai_agent_confirmation'
import type { AiAgentToolContext } from '#ai/core/ai_agent_tool_context'
import { createAiAgentToolSupport } from '#ai/registry/ai_agent_tool_helpers'
import { createApiKeyCreationTool } from '#ai/tools/create_api_key'
import { createApiKeyDeletionTool } from '#ai/tools/delete_api_key'
import { createDiagnoseMyAccessTool } from '#ai/tools/diagnose_my_access'
import { createApiKeyRevocationTool } from '#ai/tools/revoke_api_key'
import { createRunRegisteredQueryTool } from '#ai/tools/run_registered_query'
import { createSearchKnowledgeTool } from '#ai/tools/search_knowledge'
import { createSearchKnowledgeCatalogTool } from '#ai/tools/search_knowledge_catalog'
import { createWecomMessageSendTool } from '#ai/tools/send_wecom_message'
import { createSystemManagementChangeTool } from '#ai/tools/system_management_change'
import { getAiAgentToolSettings } from '#services/ai_agent_configuration_service'
import { listEnabledAiAgentMcpServers } from '#services/ai_agent_mcp_configuration_service'
import { createConfiguredMcpAgentTools } from '#services/ai_agent_mcp_service'

export function createAiAgentTools(input: AiAgentToolContext): AgentTool[] {
  const support = createAiAgentToolSupport(input)
  const knowledgeCatalogDocumentIds = input.knowledgeCatalogDocumentIds ?? new Set<number>()
  const knowledgeInput = { ...input, knowledgeCatalogDocumentIds }

  const tools =
    input.capabilityMode === 'knowledge-only'
      ? [
          createSearchKnowledgeCatalogTool(knowledgeInput, support),
          createSearchKnowledgeTool(knowledgeInput, support),
        ]
      : [
          createDiagnoseMyAccessTool(input, support),
          createRunRegisteredQueryTool(input, support),
          createSearchKnowledgeCatalogTool(knowledgeInput, support),
          createSearchKnowledgeTool(knowledgeInput, support),
          createApiKeyRevocationTool(input, support),
          createApiKeyDeletionTool(input, support),
          createSystemManagementChangeTool(input, support),
          ...(input.capabilityMode === 'channel' ? [] : [createApiKeyCreationTool(input, support)]),
          createWecomMessageSendTool(input, support),
        ]

  if (!input.enabledToolNames) return tools
  const enabled = new Set<string>(input.enabledToolNames)
  return tools.filter((tool) => enabled.has(tool.name))
}

export async function createConfiguredAiAgentTools(
  input: AiAgentToolContext
): Promise<AgentTool[]> {
  if (input.enabledToolNames?.length === 0) return []

  const settings = await getAiAgentToolSettings()
  const settingByName = new Map<string, (typeof settings)[number]>(
    settings.map((setting) => [setting.code, setting] as const)
  )
  const enabledToolNames = input.enabledToolNames ? new Set<string>(input.enabledToolNames) : null
  const configuredInput = {
    ...input,
    enabledToolNames: settings
      .filter(
        (setting) => setting.enabled && (!enabledToolNames || enabledToolNames.has(setting.code))
      )
      .map((setting) => setting.code),
  }
  const tools = createAiAgentTools(configuredInput)
  if (input.capabilityMode === 'knowledge-only') {
    return tools.map((tool) => configureToolConfirmation(tool, settingByName.get(tool.name), input))
  }

  const configuredTools = tools.map((tool) =>
    configureToolConfirmation(tool, settingByName.get(tool.name), configuredInput)
  )
  const mcpServers = await listEnabledAiAgentMcpServers()
  return [...configuredTools, ...(await createConfiguredMcpAgentTools(mcpServers, configuredInput))]
}

function configureToolConfirmation(
  tool: AgentTool,
  setting: Awaited<ReturnType<typeof getAiAgentToolSettings>>[number] | undefined,
  context: AiAgentToolContext
) {
  const configurableTool = tool as AgentTool & {
    prepareConfirmation?: (args: unknown) => Promise<unknown>
  }
  if (setting?.mode === 'confirm' && setting.enabled) {
    if (!configurableTool.prepareConfirmation) {
      configurableTool.prepareConfirmation = async (args) => {
        if (!args || typeof args !== 'object' || Array.isArray(args)) {
          throw new Error('工具参数必须是对象')
        }
        return proposeAiAgentAction({
          action: 'call_builtin_tool',
          actionInput: {
            toolName: tool.name,
            arguments: args as Record<string, unknown>,
            knowledgeCatalogDocumentIds: [...(context.knowledgeCatalogDocumentIds ?? [])],
          },
          conversationId: context.conversationId,
          userId: context.userId,
          agentRunId: context.agentRunId,
        })
      }
    }
  } else {
    delete configurableTool.prepareConfirmation
  }
  tool.description = `${tool.description}\nExecution policy: ${setting?.mode === 'confirm' ? 'require user confirmation before running' : 'execute directly'}.`
  return tool
}
