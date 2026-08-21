import { aiAgentChangeSchema } from '#ai/core/ai_agent_action_registry'
import type { AiAgentToolContext } from '#ai/core/ai_agent_tool_context'
import { type AiAgentToolSupport, createAiAgentTool } from '#ai/registry/ai_agent_tool_helpers'
import { piToolParameters } from '#ai/registry/ai_agent_tool_parameters'

export function createProposeSystemManagementChangeTool(
  _input: AiAgentToolContext,
  support: AiAgentToolSupport
) {
  return createAiAgentTool(
    async ({ action, input: actionInput }) => support.proposeManagedChange(action, actionInput),
    {
      name: 'propose_system_management_change',
      description:
        'Prepare a clearly requested management change that is not API Key creation, API Key revocation, or API Key deletion (for example user, role, or permission changes). Always call this tool before claiming a proposal exists; never fabricate a confirmation card from text alone. Pass action and input exactly as the direct top-level fields. For role creation use action create_role and input with code, name, and required permissionIds (an array of permission IDs, which may be empty), plus optional description; for other actions use the fields required by that action. Never execute it: the structured confirmation card is required. Ask for missing required fields before calling the tool. Resolve existing targets with stable IDs when available; exact user email, role code, and permission code may be used when an ID is unavailable. Ambiguous names must be rejected. Never invent an ID, name, or email: reuse the exact value the user provided or a value returned by run_registered_query.',
      schema: aiAgentChangeSchema,
      parameters: piToolParameters.systemManagementChange,
    }
  )
}
