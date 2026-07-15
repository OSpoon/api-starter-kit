/**
 * Business capabilities are registered here before they are exposed to the agent.
 *
 * Each handler must call the existing service layer and enforce its permission at
 * execution time. This registry deliberately starts empty: browser supplied page
 * actions are suggestions, not server-side tools.
 */
export interface AiAgentCapability {
  name: string
  description: string
  permission: string
  requiresConfirmation: boolean
}

export const aiAgentCapabilities: readonly AiAgentCapability[] = []
