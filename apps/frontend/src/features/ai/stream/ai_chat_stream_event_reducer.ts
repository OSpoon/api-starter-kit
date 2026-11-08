import type { Ref } from 'vue'

import type {
  AiChatCredentialDisclosure,
  AiChatPendingConfirmation,
  AiChatRunMeta,
  AiChatStreamEvent,
} from '../api'
import type { LocalAiChatMessage } from '../types'

export function applyAiChatStreamEvent(
  event: AiChatStreamEvent,
  assistantMessage: LocalAiChatMessage,
  state: {
    credentialDisclosure?: Ref<AiChatCredentialDisclosure | null>
    runMeta: Ref<AiChatRunMeta | null>
  },
  updateAssistantMessage: () => void,
  onConfirmation: (confirmation: AiChatPendingConfirmation) => void
) {
  switch (event.type) {
    case 'delta':
      assistantMessage.content += event.content
      assistantMessage.status = 'streaming'
      updateAssistantMessage()
      return true
    case 'agent_candidate_delta':
      assistantMessage.candidateCallId = event.callId
      assistantMessage.candidateContent = `${assistantMessage.candidateContent ?? ''}${event.content}`
      assistantMessage.status = 'streaming'
      updateAssistantMessage()
      return true
    case 'agent_candidate_clear':
      if (assistantMessage.candidateCallId === event.callId) {
        assistantMessage.candidateContent = ''
        assistantMessage.candidateCallId = undefined
        updateAssistantMessage()
      }
      return true
    case 'agent_candidate_commit':
      if (assistantMessage.candidateCallId === event.callId) {
        assistantMessage.content += assistantMessage.candidateContent ?? ''
        assistantMessage.candidateContent = ''
        assistantMessage.candidateCallId = undefined
        updateAssistantMessage()
      }
      return true
    case 'agent_status': {
      const activity = {
        name: event.name,
        state: event.state,
        callId: event.callId,
        startedAt: event.startedAt,
        displayName: event.displayName,
        durationMs: event.durationMs,
        message: event.message,
        errorCode: event.errorCode,
        phase: event.phase,
        detail: event.detail,
      }
      assistantMessage.activity = activity
      const timeline = assistantMessage.timeline ?? []
      const existingIndex = timeline.findIndex(
        (item) => item.kind === 'tool' && item.callId === event.callId
      )
      if (existingIndex >= 0) timeline[existingIndex] = { kind: 'tool', ...activity }
      else timeline.push({ kind: 'tool', ...activity })
      assistantMessage.timeline = [...timeline]
      updateAssistantMessage()
      return true
    }
    case 'agent_plan': {
      assistantMessage.plan = event.steps
      const planType = event.planType ?? 'confirmation'
      const timeline = assistantMessage.timeline ?? []
      const turn = Math.max(
        1,
        timeline.filter((item) => item.kind === 'phase' && item.name === 'preparing_agent').length
      )
      const planIndex = timeline.findIndex(
        (item) =>
          item.kind === 'plan' &&
          (item.planType ?? 'confirmation') === planType &&
          (item.turn === turn || (turn === 1 && item.turn === undefined))
      )
      const plan = { kind: 'plan' as const, turn, planType, steps: event.steps }
      if (planIndex >= 0) timeline[planIndex] = plan
      else timeline.push(plan)
      assistantMessage.timeline = [...timeline]
      updateAssistantMessage()
      return true
    }
    case 'agent_phase': {
      const timeline = assistantMessage.timeline ?? []
      if (event.name === 'model_response' && event.outcome === 'final_response') {
        assistantMessage.timeline = timeline.filter(
          (item) => !(item.kind === 'phase' && item.callId === event.callId)
        )
      } else {
        const phaseIndex = timeline.findIndex(
          (item) => item.kind === 'phase' && item.callId === event.callId
        )
        const phase = {
          kind: 'phase' as const,
          name: event.name,
          state: event.state,
          callId: event.callId,
          startedAt: event.startedAt,
          durationMs: event.durationMs,
          outcome: event.outcome,
        }
        if (phaseIndex >= 0) timeline[phaseIndex] = phase
        else timeline.push(phase)
        assistantMessage.timeline = [...timeline]
      }
      updateAssistantMessage()
      return true
    }
    case 'agent_model_text': {
      const timeline = assistantMessage.timeline ?? []
      const index = timeline.findIndex(
        (item) => item.kind === 'model_text' && item.callId === event.callId
      )
      const existing = timeline[index]
      if (existing?.kind === 'model_text') {
        timeline[index] = {
          ...existing,
          text: event.append ? existing.text + event.text : event.text,
          streaming: event.streaming,
        }
      } else {
        timeline.push({
          kind: 'model_text',
          callId: event.callId,
          text: event.text,
          streaming: event.streaming,
        })
      }
      assistantMessage.timeline = [...timeline]
      assistantMessage.status = 'streaming'
      updateAssistantMessage()
      return true
    }
    case 'agent_model_text_clear':
      assistantMessage.timeline = assistantMessage.timeline?.filter(
        (item) => !(item.kind === 'model_text' && item.callId === event.callId)
      )
      updateAssistantMessage()
      return true
    case 'agent_citations':
      assistantMessage.citations = event.citations
      updateAssistantMessage()
      return true
    case 'credential_disclosure':
      if (state.credentialDisclosure) state.credentialDisclosure.value = event.credential
      return true
    case 'run':
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
      return true
    case 'agent_confirmation':
      onConfirmation(event)
      return true
    default:
      return false
  }
}
