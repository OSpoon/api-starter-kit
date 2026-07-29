import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'

import env from '#start/env'

let checkpointer: PostgresSaver | null = null

function getConnectionString() {
  const url = new URL('postgresql://localhost')
  url.username = env.get('DB_USER')
  url.password = env.get('DB_PASSWORD')
  url.hostname = env.get('DB_HOST')
  url.port = String(env.get('DB_PORT'))
  url.pathname = `/${env.get('DB_DATABASE')}`
  return url.toString()
}

export function getAiAgentCheckpointConfig(input: { conversationId: number; userId: number }) {
  return {
    configurable: {
      // A conversation already belongs to its owner, but keeping both IDs in
      // the thread key prevents accidental state reuse if that invariant changes.
      thread_id: `ai-chat:${input.userId}:${input.conversationId}`,
    },
  }
}

export function getAiAgentCheckpointer() {
  checkpointer ??= PostgresSaver.fromConnString(getConnectionString(), { schema: 'ai_agent' })
  return checkpointer
}

export async function hasAiAgentCheckpoint(input: { conversationId: number; userId: number }) {
  return Boolean(await getAiAgentCheckpointer().getTuple(getAiAgentCheckpointConfig(input)))
}

export async function clearAiAgentCheckpoint(input: { conversationId: number; userId: number }) {
  await getAiAgentCheckpointer().deleteThread(
    getAiAgentCheckpointConfig(input).configurable.thread_id
  )
}
