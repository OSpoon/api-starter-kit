import type { PiAgentControl } from '#ai/ai_agent_pi_stream'

type RegisteredRun = {
  conversationId: number
  userId: number
  agentRunId: string
  control: PiAgentControl
}

const activeRuns = new Map<string, RegisteredRun>()

function key(conversationId: number, userId: number) {
  return `${userId}:${conversationId}`
}

export function registerAiAgentRun(run: RegisteredRun) {
  activeRuns.set(key(run.conversationId, run.userId), run)
}

export function getAiAgentRun(conversationId: number, userId: number) {
  return activeRuns.get(key(conversationId, userId))
}

export function releaseAiAgentRun(conversationId: number, userId: number, agentRunId: string) {
  const runKey = key(conversationId, userId)
  if (activeRuns.get(runKey)?.agentRunId === agentRunId) {
    activeRuns.delete(runKey)
  }
}
