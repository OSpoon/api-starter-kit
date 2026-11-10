import type { AgentControl } from '#ai/agent'

type RegisteredRun = {
  conversationId: number
  userId: number
  agentRunId: string
  control: AgentControl
}

const activeRuns = new Map<string, RegisteredRun>()
const claimedConversations = new Set<string>()

function key(conversationId: number, userId: number) {
  return `${userId}:${conversationId}`
}

export function registerAiAgentRun(run: RegisteredRun) {
  const runKey = key(run.conversationId, run.userId)
  claimedConversations.add(runKey)
  activeRuns.set(runKey, run)
}

export function claimAiAgentConversation(conversationId: number, userId: number) {
  const runKey = key(conversationId, userId)
  if (claimedConversations.has(runKey)) return false
  claimedConversations.add(runKey)
  return true
}

export function getAiAgentRun(conversationId: number, userId: number) {
  return activeRuns.get(key(conversationId, userId))
}

export function releaseAiAgentRun(conversationId: number, userId: number, agentRunId: string) {
  const runKey = key(conversationId, userId)
  if (activeRuns.get(runKey)?.agentRunId === agentRunId) {
    activeRuns.delete(runKey)
  }
  releaseAiAgentConversation(conversationId, userId)
}

export function releaseAiAgentConversation(conversationId: number, userId: number) {
  const runKey = key(conversationId, userId)
  claimedConversations.delete(runKey)
}
