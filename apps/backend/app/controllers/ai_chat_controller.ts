import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'

import AiChatConversation from '#models/ai_chat_conversation'
import AiChatMessage from '#models/ai_chat_message'
import {
  AiAgentConfirmationError,
  attachAgentRunConfirmations,
  confirmAiAgentAction as executeAiAgentAction,
  failUnattachedAgentRunConfirmations,
  listConversationConfirmations,
} from '#services/ai_agent_confirmation'
import { resolveGroundedAssistantResponse } from '#services/ai_agent_response_policy'
import {
  createAiAgentStream,
  getAiRequestTimeout,
  getContextCompressionOptions,
  summarizeAiConversation,
} from '#services/ai_agent_service'
import { selectAiAgentContext } from '#services/ai_agent_state'
import { resolveAiChatRegeneration } from '#services/ai_chat_regeneration'
import {
  serializeAiChatConversation,
  serializeAiChatConversationWithMessages,
  serializeAiChatMessage,
} from '#transformers/ai_chat_transformer'
import { createConversationValidator, sendAiChatMessageValidator } from '#validators/ai_chat'

function createTitle(content: string) {
  const title = content.replace(/\s+/g, ' ').trim()
  return title.length > 60 ? `${title.slice(0, 57)}...` : title || 'New chat'
}

function isApprovalReply(content: string) {
  const normalized = content.trim()
  return (
    /^(批准|同意|确认|approve|confirm|yes)$/i.test(normalized) ||
    /^(?:是|好的|可以|我)?[，,。！!\s]*(?:我)?(?:确认|同意|批准|继续)/i.test(normalized)
  )
}

function writeSse(response: HttpContext['response'], event: string, data: unknown) {
  if (response.response.writableEnded || response.response.destroyed) {
    return
  }
  response.response.write(`event: ${event}\n`)
  response.response.write(`data: ${JSON.stringify(data)}\n\n`)
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

function getSafeAiErrorMessage(error: unknown) {
  if (isAbortError(error)) return '已停止生成本次回复。'
  return '本次 AI 请求未完成，请稍后重试。'
}

function parseAgentConfirmation(output: unknown) {
  const content =
    typeof output === 'string'
      ? output
      : output &&
          typeof output === 'object' &&
          'content' in output &&
          typeof output.content === 'string'
        ? output.content
        : null
  if (!content) {
    return null
  }

  try {
    const payload = JSON.parse(content) as {
      kind?: string
      confirmation?: { id?: number; action?: string; targetSummary?: unknown; expiresAt?: unknown }
    }
    const confirmation = payload.confirmation
    if (
      payload.kind !== 'confirmation' ||
      !confirmation ||
      !Number.isInteger(confirmation.id) ||
      !confirmation.action ||
      !confirmation.targetSummary
    ) {
      return null
    }
    return confirmation
  } catch {
    return null
  }
}

function parseAgentToolError(output: unknown) {
  const content =
    typeof output === 'string'
      ? output
      : output &&
          typeof output === 'object' &&
          'content' in output &&
          typeof output.content === 'string'
        ? output.content
        : null
  if (!content) return null

  try {
    const payload = JSON.parse(content) as { kind?: string; message?: unknown }
    return payload.kind === 'action_error' && typeof payload.message === 'string'
      ? payload.message
      : null
  } catch {
    return null
  }
}

async function streamAiAgentToolStatuses(
  run: Awaited<ReturnType<typeof createAiAgentStream>>,
  response: HttpContext['response'],
  signal: AbortSignal,
  onToolCompleted?: () => void | Promise<void>
) {
  const completedToolNames = new Set<string>()
  for await (const toolCall of run.stream.toolCalls) {
    if (signal.aborted) throw new DOMException('AI request was cancelled', 'AbortError')
    writeSse(response, 'agent_status', { name: toolCall.name, state: 'running' })
    const state = await toolCall.status
    const output = state === 'finished' ? await toolCall.output : null
    const toolError = parseAgentToolError(output)
    writeSse(response, 'agent_status', {
      name: toolCall.name,
      state: state === 'finished' && !toolError ? 'done' : 'error',
      ...(toolError ? { message: toolError } : {}),
    })
    if (state === 'finished') {
      completedToolNames.add(toolCall.name)
      await onToolCompleted?.()
      const confirmation = parseAgentConfirmation(output)
      if (confirmation) {
        writeSse(response, 'agent_confirmation', confirmation)
      }
    }
  }
  return completedToolNames
}

@ApiSecurity('bearerAuth')
export default class AiChatController {
  @ApiOperation({
    summary: '获取 AI 会话列表',
    description: '返回当前管理员的 AI 聊天历史会话。',
  })
  @ApiResponse({ status: 200, description: 'AI 会话列表' })
  async index({ auth, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const conversations = await AiChatConversation.query()
      .where('user_id', user.id)
      .orderBy('updated_at', 'desc')

    return serialize(conversations.map(serializeAiChatConversation))
  }

  @ApiOperation({
    summary: '创建 AI 会话',
    description: '创建一个新的纯聊天会话。',
  })
  @ApiResponse({ status: 200, description: '已创建的 AI 会话' })
  async store({ auth, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(createConversationValidator)
    const conversation = await AiChatConversation.create({
      userId: user.id,
      title: payload.title ?? 'New chat',
    })

    await conversation.load('messages', (query) => query.orderBy('created_at', 'asc'))
    return serialize(serializeAiChatConversationWithMessages(conversation))
  }

  @ApiOperation({
    summary: '获取 AI 会话详情',
    description: '返回指定会话及其消息列表。',
  })
  @ApiResponse({ status: 200, description: 'AI 会话详情' })
  async show({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const conversation = await AiChatConversation.query()
      .where('id', params.id)
      .where('user_id', user.id)
      .preload('messages', (query) => query.orderBy('created_at', 'asc'))
      .firstOrFail()

    const confirmations = await listConversationConfirmations(conversation.id, user.id)
    return serialize({ ...serializeAiChatConversationWithMessages(conversation), confirmations })
  }

  @ApiOperation({
    summary: '发送 AI 聊天消息',
    description: '保存用户消息，调用 OpenAI 兼容接口，并保存助手回复。',
  })
  @ApiResponse({ status: 200, description: '流式 AI 会话响应' })
  async sendMessage({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(sendAiChatMessageValidator)
    const conversation = await AiChatConversation.query()
      .where('id', params.id)
      .where('user_id', user.id)
      .preload('messages', (query) => query.orderBy('created_at', 'asc'))
      .firstOrFail()

    const regeneration = payload.regenerateAssistantMessageId
      ? resolveAiChatRegeneration(conversation.messages, payload.regenerateAssistantMessageId)
      : null

    if (payload.regenerateAssistantMessageId) {
      if (!regeneration) {
        return response.unprocessableEntity({ message: '只能重新生成当前对话的最后一条助手回复' })
      }

      await AiChatMessage.query()
        .where('id', regeneration.assistantMessage.id)
        .where('conversation_id', conversation.id)
        .delete()
      conversation.contextSummary = null
      conversation.summaryUntilMessageId = null
      await conversation.save()
    }

    const userMessage =
      regeneration?.userMessage ??
      (await AiChatMessage.create({
        conversationId: conversation.id,
        role: 'user',
        content: payload.content,
      }))

    if (
      !payload.regenerateAssistantMessageId &&
      conversation.messages.length === 0 &&
      conversation.title === 'New chat'
    ) {
      conversation.title = createTitle(payload.content)
      await conversation.save()
    }

    response.header('Content-Type', 'text/event-stream; charset=utf-8')
    response.header('Cache-Control', 'no-cache, no-transform')
    response.header('Connection', 'keep-alive')
    response.header('X-Accel-Buffering', 'no')
    response.writeHead(200)
    const abortController = new AbortController()
    const abortOnDisconnect = () => abortController.abort()
    response.response.once('close', abortOnDisconnect)

    writeSse(response, 'user', {
      conversation: serializeAiChatConversation(conversation),
      message: serializeAiChatMessage(userMessage),
    })

    if (!payload.regenerateAssistantMessageId && isApprovalReply(payload.content)) {
      const pendingConfirmations = await listConversationConfirmations(conversation.id, user.id)
      const assistantContent = pendingConfirmations.length
        ? '请使用对话中的结构化确认卡批准此操作；我不会根据聊天文字执行系统变更。'
        : '当前没有可批准的系统变更，因此未执行任何操作。请先重新发起需要确认的操作。'
      const assistantMessage = await AiChatMessage.create({
        conversationId: conversation.id,
        role: 'assistant',
        content: assistantContent,
      })
      await conversation.load('messages', (query) => query.orderBy('created_at', 'asc'))
      writeSse(response, 'done', {
        conversation: serializeAiChatConversationWithMessages(conversation),
        message: serializeAiChatMessage(assistantMessage),
        confirmations: [],
      })
      response.response.end()
      return
    }

    let assistantContent = ''
    let agentRunId: string | null = null
    const requestTimeout = setTimeout(() => abortController.abort(), getAiRequestTimeout())

    try {
      const persistedMessages = payload.regenerateAssistantMessageId
        ? regeneration!.messages
        : conversation.messages
      const history = payload.regenerateAssistantMessageId
        ? persistedMessages.map((message) => ({ role: message.role, content: message.content }))
        : [
            ...persistedMessages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
            { role: userMessage.role, content: userMessage.content },
          ]
      const compression = getContextCompressionOptions()
      const context = compression.enabled
        ? selectAiAgentContext({
            messages: history.map((message, index) => ({
              ...message,
              id: persistedMessages[index]?.id ?? userMessage.id,
            })),
            summary: conversation.contextSummary,
            summaryUntilMessageId: conversation.summaryUntilMessageId,
            thresholdTokens: compression.thresholdTokens,
            recentMessageCount: compression.recentMessageCount,
          })
        : { messages: history, messagesToSummarize: [] }
      let messages = context.messages
      if (context.messagesToSummarize.length > 0) {
        try {
          const summary = await summarizeAiConversation({
            existingSummary: conversation.contextSummary,
            messages: context.messagesToSummarize,
          })
          const summaryUntilMessageId = context.messagesToSummarize.at(-1)?.id
          if (!summaryUntilMessageId) throw new Error('AI context summary boundary is missing')
          conversation.contextSummary = summary
          conversation.summaryUntilMessageId = summaryUntilMessageId
          await conversation.save()
          messages = [
            { role: 'system', content: `Persisted conversation summary:\n${summary}` },
            ...history.slice(-compression.recentMessageCount),
          ]
        } catch {
          // Never discard persisted history when summarization fails. The model
          // receives a bounded recent window while the complete history remains
          // available through the conversation API.
          messages = history.slice(-compression.recentMessageCount)
        }
      }
      const run = await createAiAgentStream({
        conversationId: conversation.id,
        userId: user.id,
        messages,
        context: payload.context,
        signal: abortController.signal,
      })
      agentRunId = run.agentRunId
      let toolStatusError: unknown
      let hasCompletedTool = false
      let bufferedContent = ''
      const toolStatusTask = streamAiAgentToolStatuses(
        run,
        response,
        abortController.signal,
        () => {
          hasCompletedTool = true
          if (bufferedContent) {
            writeSse(response, 'delta', { content: bufferedContent })
            bufferedContent = ''
          }
        }
      ).catch((error: unknown) => {
        // The tool-status iterator shares the Agent event stream with the
        // message iterator. Handle its rejection immediately: waiting until
        // after the message loop lets an unavailable LLM become an
        // unhandled rejection and terminate the HTTP process.
        toolStatusError = error
      })

      for await (const message of run.stream.messages) {
        if (abortController.signal.aborted) {
          throw new DOMException('AI request was cancelled', 'AbortError')
        }
        for await (const delta of message.text) {
          if (!delta) {
            continue
          }

          assistantContent += delta
          if (hasCompletedTool) {
            writeSse(response, 'delta', { content: delta })
          } else {
            bufferedContent += delta
          }
        }
      }
      const completedToolNames = await toolStatusTask
      if (toolStatusError) {
        throw toolStatusError
      }
      assistantContent = resolveGroundedAssistantResponse({
        content: assistantContent,
        completedToolNames: completedToolNames ?? new Set(),
      })
      if (!hasCompletedTool) {
        writeSse(response, 'delta', { content: assistantContent })
      }
      const assistantMessage = await AiChatMessage.create({
        conversationId: conversation.id,
        role: 'assistant',
        content: assistantContent,
      })
      const confirmations = await attachAgentRunConfirmations({
        conversationId: conversation.id,
        userId: user.id,
        agentRunId: run.agentRunId,
        assistantMessageId: assistantMessage.id,
      })

      await conversation.load('messages', (query) => query.orderBy('created_at', 'asc'))
      writeSse(response, 'done', {
        conversation: serializeAiChatConversationWithMessages(conversation),
        message: serializeAiChatMessage(assistantMessage),
        confirmations,
      })
    } catch (error) {
      if (agentRunId) {
        await failUnattachedAgentRunConfirmations({
          conversationId: conversation.id,
          userId: user.id,
          agentRunId,
        })
      }
      const message = getSafeAiErrorMessage(error)
      const failedAssistantMessage = await AiChatMessage.create({
        conversationId: conversation.id,
        role: 'assistant',
        content: assistantContent.trim() ? `${assistantContent}\n\n${message}` : message,
      })
      writeSse(response, 'error', {
        message,
        assistantMessage: serializeAiChatMessage(failedAssistantMessage),
      })
    } finally {
      clearTimeout(requestTimeout)
      response.response.off('close', abortOnDisconnect)
      response.response.end()
    }
  }

  @ApiOperation({
    summary: '确认 AI 代理受控操作',
    description: '执行当前用户在 AI 对话中创建且尚未过期的受控操作确认。',
  })
  @ApiResponse({ status: 200, description: '已执行受控操作' })
  async confirmAiAgentAction(ctx: HttpContext) {
    const { auth, params, response, serialize } = ctx
    const user = auth.getUserOrFail()
    const conversation = await AiChatConversation.query()
      .where('id', params.id)
      .where('user_id', user.id)
      .firstOrFail()

    try {
      const confirmation = await executeAiAgentAction(ctx, {
        confirmationId: Number(params.confirmationId),
        conversationId: conversation.id,
        userId: user.id,
      })
      return serialize(confirmation)
    } catch (error) {
      if (error instanceof AiAgentConfirmationError) {
        if (error.status === 404) {
          return response.notFound({ message: error.message })
        }
        if (error.status === 409) {
          return response.conflict({ message: error.message })
        }
        if (error.status === 403) {
          return response.forbidden({ message: error.message })
        }
        return response.unprocessableEntity({ message: error.message })
      }
      throw error
    }
  }

  @ApiOperation({
    summary: '删除 AI 会话',
    description: '删除指定 AI 会话及其历史消息。',
  })
  @ApiResponse({ status: 200, description: '删除结果' })
  async destroy({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const conversation = await AiChatConversation.query()
      .where('id', params.id)
      .where('user_id', user.id)
      .firstOrFail()

    await conversation.delete()
    return serialize({ id: Number(params.id), deleted: true })
  }
}
