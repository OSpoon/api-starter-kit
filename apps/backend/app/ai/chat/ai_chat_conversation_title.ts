import { randomUUID } from 'node:crypto'

import logger from '@adonisjs/core/services/logger'

import type { AgentAssistantMessage } from '#ai/agent'
import { aiAgentConversationTitlePrompt } from '#ai/policy/ai_agent_prompt_policy'
import { getAiAgentEngine, getAiAgentModelConfig } from '#ai/runtime/ai_agent_runtime'
import { recordAiUsageEvent } from '#services/ai_usage_service'

export function createAiChatConversationTitle(content: string) {
  const title = content.replace(/\s+/g, ' ').trim()
  return title.length > 60 ? `${title.slice(0, 57)}...` : title || 'New chat'
}

export async function generateAiChatConversationTitleFromImage(input: {
  content: string
  imageData: Buffer
  imageMimeType: string
  userId: number
  conversationId: number
  pageTitle?: string
  signal?: AbortSignal
}) {
  const model = await getAiAgentModelConfig()
  const agentRunId = randomUUID()
  const session = await getAiAgentEngine().createSession({
    model,
    systemPrompt: aiAgentConversationTitlePrompt,
    tools: [],
    messages: [],
    initialPrompt: [
      input.content.trim() || '请根据图片中表达的用户意图概括会话标题。',
      input.pageTitle ? `当前页面（仅作背景）：${input.pageTitle}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    initialImage: { data: input.imageData.toString('base64'), mimeType: input.imageMimeType },
    sessionId: `ai-chat-title:${agentRunId}`,
    signal: input.signal,
    telemetry: { enabled: false },
  })

  let generatedText = ''
  let usageMessage: AgentAssistantMessage | undefined

  try {
    for await (const event of session.events) {
      if (event.type === 'text_delta') generatedText += event.delta
      if (event.type === 'message_end') usageMessage = event.message
    }
    await session.completion
  } catch (error) {
    session.control.abort()
    throw error
  }

  if (usageMessage) {
    void recordAiUsageEvent({
      userId: input.userId,
      conversationId: input.conversationId,
      agentRunId,
      callSequence: 0,
      providerId: usageMessage.providerId,
      modelId: usageMessage.modelId,
      baseUrl: session.model.baseUrl,
      usage: {
        input: usageMessage.usage.input,
        output: usageMessage.usage.output,
        cacheRead: usageMessage.usage.cacheRead,
        cacheWrite: usageMessage.usage.cacheWrite,
        totalTokens: usageMessage.usage.totalTokens,
      },
      status: usageMessage.stopReason === 'error' ? 'failed' : 'completed',
    }).catch((error) => {
      logger.warn(
        { err: error, conversationId: input.conversationId },
        'AI title usage was not recorded'
      )
    })
  }

  if (usageMessage?.stopReason === 'error') {
    throw new Error('Image conversation title generation failed')
  }

  const title = usageMessage?.text || generatedText
  return title.trim() ? createAiChatConversationTitle(title) : ''
}
