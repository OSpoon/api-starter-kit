import type { AgentTool } from '@earendil-works/pi-agent-core'

import type { AiAgentToolContext } from '#ai/core/ai_agent_tool_context'
import { createAiAgentToolSupport } from '#ai/registry/ai_agent_tool_helpers'
import { createDiagnoseMyAccessTool } from '#ai/tools/diagnose_my_access'
import { createProposeApiKeyCreationTool } from '#ai/tools/propose_api_key_creation'
import { createProposeApiKeyDeletionTool } from '#ai/tools/propose_api_key_deletion'
import { createProposeApiKeyRevocationTool } from '#ai/tools/propose_api_key_revocation'
import { createProposeSystemManagementChangeTool } from '#ai/tools/propose_system_management_change'
import { createProposeWecomMessageSendTool } from '#ai/tools/propose_wecom_message_send'
import { createRunRegisteredQueryTool } from '#ai/tools/run_registered_query'
import { createSearchKnowledgeTool } from '#ai/tools/search_knowledge'

export function createAiAgentTools(input: AiAgentToolContext): AgentTool[] {
  const support = createAiAgentToolSupport(input)

  return [
    createDiagnoseMyAccessTool(input, support),
    createRunRegisteredQueryTool(input, support),
    createSearchKnowledgeTool(input, support),
    createProposeApiKeyRevocationTool(input, support),
    createProposeApiKeyDeletionTool(input, support),
    createProposeSystemManagementChangeTool(input, support),
    createProposeApiKeyCreationTool(input, support),
    createProposeWecomMessageSendTool(input, support),
  ]
}
