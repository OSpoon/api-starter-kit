import type { AgentTool } from '#ai/agent'
import { proposeAiAgentAction } from '#ai/core/ai_agent_confirmation'
import {
  type BuiltInAiAgentToolName,
  builtInAiAgentToolNames,
} from '#ai/core/ai_agent_tool_catalog'
import type { AiAgentToolContext } from '#ai/core/ai_agent_tool_context'
import { createAiAgentToolSupport } from '#ai/registry/ai_agent_tool_helpers'
import {
  createAgentSkillBashTool,
  createListAgentSkillsTool,
  createLoadAgentSkillTool,
} from '#ai/tools/agent_skills'
import { createApiKeyCreationTool } from '#ai/tools/create_api_key'
import { createApiKeyDeletionTool } from '#ai/tools/delete_api_key'
import { createDiagnoseMyAccessTool } from '#ai/tools/diagnose_my_access'
import { createReadPdfAttachmentTool } from '#ai/tools/read_pdf_attachment'
import { createApiKeyRevocationTool } from '#ai/tools/revoke_api_key'
import { createRunRegisteredQueryTool } from '#ai/tools/run_registered_query'
import { createSearchKnowledgeTool } from '#ai/tools/search_knowledge'
import { createSearchKnowledgeCatalogTool } from '#ai/tools/search_knowledge_catalog'
import { createSystemManagementChangeTool } from '#ai/tools/system_management_change'
import { createAiAgentTaskPlanTool } from '#ai/tools/update_task_plan'
import { getAiAgentToolSettings } from '#services/ai_agent_configuration_service'
import { listEnabledAiAgentMcpServers } from '#services/ai_agent_mcp_configuration_service'
import { createConfiguredMcpAgentTools } from '#services/ai_agent_mcp_service'

export function createAiAgentTools(input: AiAgentToolContext): AgentTool[] {
  const support = createAiAgentToolSupport(input)
  const knowledgeCatalogDocumentIds = input.knowledgeCatalogDocumentIds ?? new Set<number>()
  const knowledgeInput = { ...input, knowledgeCatalogDocumentIds }
  const factories = {
    diagnose_my_access: () => createDiagnoseMyAccessTool(input, support),
    run_registered_query: () => createRunRegisteredQueryTool(input, support),
    search_knowledge_catalog: () => createSearchKnowledgeCatalogTool(knowledgeInput, support),
    search_knowledge: () => createSearchKnowledgeTool(knowledgeInput, support),
    read_pdf_attachment: () => createReadPdfAttachmentTool(input),
    revoke_api_key: () => createApiKeyRevocationTool(input, support),
    delete_api_key: () => createApiKeyDeletionTool(input, support),
    system_management_change: () => createSystemManagementChangeTool(input, support),
    create_api_key: () => createApiKeyCreationTool(input, support),
  } satisfies Record<BuiltInAiAgentToolName, () => AgentTool>
  const tools = builtInAiAgentToolNames
    .filter((name) =>
      input.capabilityMode === 'knowledge-only'
        ? name === 'search_knowledge_catalog' || name === 'search_knowledge'
        : (name !== 'read_pdf_attachment' ||
            (input.hasPdfAttachments && input.capabilityMode !== 'channel')) &&
          (name !== 'create_api_key' || input.capabilityMode !== 'channel')
    )
    .map((name) => factories[name]())

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
  if (input.capabilityMode === 'automation-readonly') {
    const readOnlyTools = new Set([
      'diagnose_my_access',
      'run_registered_query',
      'search_knowledge_catalog',
      'search_knowledge',
    ])
    return tools
      .filter((tool) => readOnlyTools.has(tool.name))
      .filter((tool) => settingByName.get(tool.name)?.mode !== 'confirm')
  }
  if (input.capabilityMode === 'knowledge-only') {
    return tools.map((tool) => configureToolConfirmation(tool, settingByName.get(tool.name), input))
  }

  const configuredTools = tools.map((tool) =>
    configureToolConfirmation(tool, settingByName.get(tool.name), configuredInput)
  )
  const taskPlanTool = createAiAgentTaskPlanTool(
    configuredInput,
    createAiAgentToolSupport(configuredInput)
  )
  const skillTools = [
    createListAgentSkillsTool(configuredInput),
    createLoadAgentSkillTool(configuredInput),
    createAgentSkillBashTool(configuredInput),
  ]
  const mcpTools =
    input.capabilityMode === undefined || input.capabilityMode === 'full'
      ? await createConfiguredMcpAgentTools(await listEnabledAiAgentMcpServers(), configuredInput)
      : []
  return [...configuredTools, taskPlanTool, ...skillTools, ...mcpTools]
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
