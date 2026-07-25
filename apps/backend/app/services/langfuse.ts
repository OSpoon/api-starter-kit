import { CallbackHandler } from '@langfuse/langchain'

import env from '#start/env'

export function createLangfuseCallback(input: {
  userId: number
  conversationId: number
  agentRunId: string
}) {
  if (
    !env.get('LANGFUSE_ENABLED') ||
    !env.get('LANGFUSE_PUBLIC_KEY') ||
    !env.get('LANGFUSE_SECRET_KEY')
  ) {
    return undefined
  }

  return new CallbackHandler({
    userId: String(input.userId),
    sessionId: String(input.conversationId),
    traceMetadata: {
      agentRunId: input.agentRunId,
      conversationId: input.conversationId,
    },
    tags: ['admin-assistant'],
  })
}
