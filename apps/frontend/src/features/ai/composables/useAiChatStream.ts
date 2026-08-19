import type { ComputedRef } from 'vue'
import { toast } from 'vue-sonner'

import {
  type AiChatConfirmation,
  type AiChatConversation,
  type AiChatPageContext,
  type AiChatPendingConfirmation,
  AiChatStreamIncompleteError,
  type AiChatTimelineItem,
  getAiChatConversation,
  queueAiChatMessage,
  streamAiChatMessage,
} from '../api'
import type { LocalAiChatMessage } from '../types'
import type { AiChatConversationState } from './useAiChatConversations'

export function useAiChatStream(
  token: () => string | null,
  translate: (key: string) => string,
  pageContext: ComputedRef<AiChatPageContext>,
  state: AiChatConversationState,
  ensureConversation: () => Promise<AiChatConversation>,
  refreshConversations: () => Promise<void>,
  presentLatestConfirmation: (confirmations: AiChatConfirmation[]) => void
) {
  async function send(message: string, regenerateAssistantMessageId?: number) {
    if (state.loading.value && state.conversation.value && !regenerateAssistantMessageId) {
      try {
        const queued = await queueAiChatMessage(
          token(),
          state.conversation.value.id,
          message,
          'steer'
        )
        state.streamingMessages.value = [
          ...state.streamingMessages.value,
          { id: String(queued.message.id), role: 'user', content: queued.message.content },
        ]
      } catch (error) {
        toast.error(error instanceof Error ? error.message : translate('common.error'))
      }
      return
    }

    state.abortController.value?.abort()
    const abortController = new AbortController()
    state.abortController.value = abortController
    state.loading.value = true
    state.runMeta.value = null
    const currentMessages = state.conversation.value?.messages ?? []
    const userMessage = regenerateAssistantMessageId
      ? null
      : { id: `local-user-${Date.now()}`, role: 'user' as const, content: message }
    const assistantMessage: LocalAiChatMessage = {
      id: `streaming-assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      status: 'pending',
      timeline: [],
    }
    state.streamingMessageId.value = assistantMessage.id
    state.streamingMessages.value = regenerateAssistantMessageId
      ? [
          ...currentMessages.filter((item) => item.id !== regenerateAssistantMessageId),
          assistantMessage,
        ]
      : [...currentMessages, userMessage!, assistantMessage]
    const newlyCreatedConfirmationIds = new Set<number>()
    let completedAssistantMessageId: number | null = null
    let completedTimeline: AiChatTimelineItem[] | undefined
    let streamedConfirmation: AiChatPendingConfirmation | null = null

    const updateAssistantMessage = () => {
      state.streamingMessages.value = state.streamingMessages.value.map((item) =>
        item.id === assistantMessage.id ? { ...assistantMessage } : item
      )
    }

    try {
      const conversation = await ensureConversation()
      await streamAiChatMessage(
        token(),
        conversation.id,
        message,
        (event) => {
          if (event.type === 'user') {
            state.conversations.value = [
              event.conversation,
              ...state.conversations.value.filter((item) => item.id !== event.conversation.id),
            ]
            state.streamingMessages.value = state.streamingMessages.value.map((item) =>
              userMessage && item.id === userMessage.id ? event.message : item
            )
          }

          if (event.type === 'delta') {
            assistantMessage.content += event.content
            assistantMessage.status = 'streaming'
            updateAssistantMessage()
          }

          if (event.type === 'agent_status') {
            assistantMessage.activity = {
              name: event.name,
              state: event.state,
              callId: event.callId,
              durationMs: event.durationMs,
              message: event.message,
              errorCode: event.errorCode,
              phase: event.phase,
              detail: event.detail,
            }
            const timeline = assistantMessage.timeline ?? []
            const existingIndex = timeline.findIndex(
              (item) =>
                item.kind === 'tool' && item.callId === event.callId && event.callId !== undefined
            )
            const activity = { ...assistantMessage.activity }
            if (existingIndex >= 0) timeline[existingIndex] = { kind: 'tool', ...activity }
            else timeline.push({ kind: 'tool', ...activity })
            assistantMessage.timeline = [...timeline]
            updateAssistantMessage()
          }

          if (event.type === 'agent_plan') {
            assistantMessage.plan = event.steps
            assistantMessage.timeline = [
              ...(assistantMessage.timeline ?? []).filter((item) => item.kind !== 'plan'),
              { kind: 'plan', steps: event.steps },
            ]
            updateAssistantMessage()
          }

          if (event.type === 'agent_citations') {
            assistantMessage.citations = event.citations
            updateAssistantMessage()
          }

          if (event.type === 'run') {
            state.runMeta.value = {
              agentRunId: event.agentRunId,
              usage: event.usage,
              durationMs: event.durationMs,
            }
            assistantMessage.timeline = [
              ...(assistantMessage.timeline ?? []).filter((item) => item.kind !== 'run'),
              { kind: 'run', durationMs: event.durationMs, usage: event.usage },
            ]
            updateAssistantMessage()
          }

          if (event.type === 'agent_confirmation') {
            streamedConfirmation = {
              id: event.id,
              action: event.action,
              impact: event.impact,
              targetType: event.targetType,
              targetId: event.targetId,
              targetSummary: event.targetSummary,
              changeSummary: event.changeSummary,
              expiresAt: event.expiresAt,
              presentation: event.presentation,
            }
          }

          if (event.type === 'done') {
            completedAssistantMessageId = event.message.id
            completedTimeline = assistantMessage.timeline
            event.confirmations.forEach((confirmation) =>
              newlyCreatedConfirmationIds.add(confirmation.id)
            )
            state.conversation.value = {
              ...event.conversation,
              confirmations: [
                ...state.confirmations.value,
                ...event.confirmations.map((confirmation) => ({
                  ...confirmation,
                  messageId: event.message.id,
                })),
              ],
            }
            state.confirmations.value = state.conversation.value.confirmations ?? []
            state.streamingMessageId.value = null
            state.streamingMessages.value = []
            const confirmation = event.confirmations.at(-1) ?? streamedConfirmation
            if (confirmation) {
              presentLatestConfirmation([{ ...confirmation, messageId: event.message.id }])
            }
          }

          if (event.type === 'error') {
            assistantMessage.content = event.assistantMessage?.content ?? event.message
            assistantMessage.citations = event.assistantMessage?.citations ?? []
            assistantMessage.status = 'error'
            updateAssistantMessage()
            throw new Error(event.message)
          }
        },
        {
          signal: abortController.signal,
          context: pageContext.value,
          regenerateAssistantMessageId,
        }
      )
      const persistedConversation = await getAiChatConversation(token(), conversation.id)
      state.conversation.value = {
        ...persistedConversation,
        messages: persistedConversation.messages.map((item) =>
          item.id === completedAssistantMessageId && completedTimeline
            ? { ...item, timeline: completedTimeline }
            : item
        ),
      }
      state.confirmations.value = persistedConversation.confirmations ?? []
      const latestCreatedConfirmation = state.confirmations.value
        .filter(
          (confirmation) =>
            newlyCreatedConfirmationIds.has(confirmation.id) ||
            confirmation.messageId === completedAssistantMessageId
        )
        .at(-1)
      if (latestCreatedConfirmation) presentLatestConfirmation([latestCreatedConfirmation])
      await refreshConversations()
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        assistantMessage.status = assistantMessage.content.trim() ? 'interrupted' : 'done'
        updateAssistantMessage()
      } else {
        if (error instanceof AiChatStreamIncompleteError && state.conversation.value) {
          try {
            const persistedConversation = await getAiChatConversation(
              token(),
              state.conversation.value.id
            )
            let currentUserMessageIndex = -1
            for (let index = persistedConversation.messages.length - 1; index >= 0; index -= 1) {
              const candidate = persistedConversation.messages[index]
              if (candidate?.role === 'user' && candidate.content === message) {
                currentUserMessageIndex = index
                break
              }
            }
            const persistedAssistantMessage =
              currentUserMessageIndex >= 0
                ? persistedConversation.messages[currentUserMessageIndex + 1]
                : undefined
            if (
              persistedAssistantMessage?.role === 'assistant' &&
              persistedAssistantMessage.content.trim()
            ) {
              state.conversation.value = persistedConversation
              state.confirmations.value = persistedConversation.confirmations ?? []
              state.streamingMessageId.value = null
              state.streamingMessages.value = []
              await refreshConversations()
              return
            }
          } catch {
            // Fall through to the rendered-content fallback below.
          }
        }
        if (error instanceof AiChatStreamIncompleteError && assistantMessage.content.trim()) {
          assistantMessage.status = 'done'
          state.streamingMessageId.value = null
          updateAssistantMessage()
          return
        }
        assistantMessage.status = 'error'
        updateAssistantMessage()
        toast.error(
          error instanceof AiChatStreamIncompleteError
            ? translate('ai_chat.stream_incomplete')
            : error instanceof Error
              ? error.message
              : translate('common.error')
        )
      }
    } finally {
      if (state.abortController.value === abortController) {
        state.abortController.value = null
        state.streamingMessageId.value = null
        state.loading.value = false
      }
    }
  }

  return { send }
}
