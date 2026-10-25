import { aiAgentChangeSchema, channelAiAgentChangeSchema } from '#ai/core/ai_agent_action_contracts'
import type { AiAgentToolContext } from '#ai/core/ai_agent_tool_context'
import { type AiAgentToolSupport, createAiAgentTool } from '#ai/registry/ai_agent_tool_helpers'
import { piToolParameters } from '#ai/registry/ai_agent_tool_parameters'

export function createSystemManagementChangeTool(
  input: AiAgentToolContext,
  support: AiAgentToolSupport
) {
  const isChannel = input.capabilityMode === 'channel'
  return createAiAgentTool(
    async ({ action, input: actionInput }) =>
      support.executeManagedChange('system_management_change', action, actionInput),
    {
      name: 'system_management_change',
      description: `Perform a supported user or role management change; call this tool for explicit requests instead of only narrating an operation. The configured execution policy determines whether it runs directly or waits for a confirmation card. Pass action and input as direct top-level fields, for example action create_role with input fields code and name. create_user requires fullName, email, and roleIds. Ask for missing required fields; resolve existing targets using stable IDs or exact values returned by a query, and never invent them.${isChannel ? ' Password reset and user creation are available only in the web assistant because their one-time passwords are disclosed through its secure response.' : ''}`,
      schema: isChannel ? channelAiAgentChangeSchema : aiAgentChangeSchema,
      parameters: isChannel
        ? piToolParameters.channelSystemManagementChange
        : piToolParameters.systemManagementChange,
      prepareConfirmation: ({ action, input: actionInput }) =>
        support.prepareManagedChange('system_management_change', action, actionInput),
    }
  )
}
