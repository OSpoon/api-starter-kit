import { z } from 'zod'

import type { AiAgentToolContext } from '#ai/core/ai_agent_tool_context'
import { diagnoseMyAccess } from '#ai/diagnostics/ai_access_diagnostic'
import { type AiAgentToolSupport, createAiAgentTool } from '#ai/registry/ai_agent_tool_helpers'
import { piToolParameters } from '#ai/registry/ai_agent_tool_parameters'
import { permissionCodes } from '#authorization/permission_catalog'

export function createDiagnoseMyAccessTool(input: AiAgentToolContext, support: AiAgentToolSupport) {
  return createAiAgentTool(
    async ({ permissionCode }) => {
      support.throwIfAborted()
      return diagnoseMyAccess(input.userId, permissionCode)
    },
    {
      name: 'diagnose_my_access',
      description:
        'Diagnose only the current authenticated user’s access. For an overall permission review, call with an empty object and summarize effectivePermissions; omit permissionCode. Set permissionCode only when the user explicitly asks whether they have one named permission.',
      schema: z.object({ permissionCode: z.enum(permissionCodes).optional() }),
      parameters: piToolParameters.diagnoseMyAccess,
      executionMode: 'parallel',
    }
  )
}
