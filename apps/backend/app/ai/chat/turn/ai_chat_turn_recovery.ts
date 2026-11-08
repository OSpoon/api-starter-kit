import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'

import { failUnattachedAgentRunConfirmations } from '#ai/core/ai_agent_confirmation'

const MAX_CONFIRMATION_CLEANUP_ATTEMPTS = 3
const CONFIRMATION_CLEANUP_RETRY_DELAY_MS = 150

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function shouldPreserveInterruptedRun(error: unknown) {
  return isAbortError(error)
}

export function getSafeAiErrorMessage(error: unknown) {
  if (isAbortError(error)) return '已停止生成本次回复。'
  return '本次 AI 请求未完成，请稍后重试。'
}

export async function failUnattachedConfirmationsWithRetry(input: {
  conversationId: number
  userId: number
  agentRunId: string
  ctx: HttpContext
}) {
  const attributes = {
    conversationId: input.conversationId,
    userId: input.userId,
    agentRunId: input.agentRunId,
  }
  for (let attempt = 1; attempt <= MAX_CONFIRMATION_CLEANUP_ATTEMPTS; attempt += 1) {
    try {
      await failUnattachedAgentRunConfirmations(input)
      return
    } catch (error) {
      if (attempt === MAX_CONFIRMATION_CLEANUP_ATTEMPTS) {
        logger.error(
          { err: error, ...attributes },
          'AI unattached confirmation cleanup failed after retries'
        )
        return
      }
      await new Promise((resolve) =>
        setTimeout(resolve, CONFIRMATION_CLEANUP_RETRY_DELAY_MS * attempt)
      )
    }
  }
}
