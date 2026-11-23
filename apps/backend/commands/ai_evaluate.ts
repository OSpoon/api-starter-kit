import { BaseCommand } from '@adonisjs/core/ace'

import { createAiAgentSystemPrompt } from '#ai/chat/ai_agent_service'
import {
  aiAssistantEvaluationCases,
  createAiEvaluationTools,
  evaluateAiAssistantTurn,
  getLatestEvaluationAssistantText,
} from '#ai/evaluation/ai_evaluation'
import { getAiAgentEngine, getAiAgentModelConfig } from '#ai/runtime/ai_agent_runtime'

/** Uses mock tools only; each scenario has isolated history and never mutates business data. */
export default class AiEvaluate extends BaseCommand {
  static commandName = 'ai:evaluate'
  static description = 'Validate the configured AI model against core assistant tool-use scenarios'
  static options = { startApp: true }

  async run() {
    const failures: string[] = []
    for (const evaluation of aiAssistantEvaluationCases) {
      const calledTools: string[] = []
      let toolOutputs: Record<string, unknown> = {}
      const session = await getAiAgentEngine().createSession({
        model: await getAiAgentModelConfig(),
        systemPrompt: createAiAgentSystemPrompt(
          undefined,
          ' <live-session-state>{"pendingConfirmations":[]}</live-session-state>'
        ),
        tools: createAiEvaluationTools(() => toolOutputs, calledTools),
        messages: [],
        sessionId: `ai-evaluate:${evaluation.name}`,
        telemetry: { enabled: false },
      })

      for (const [turnIndex, turn] of evaluation.turns.entries()) {
        const label = `${evaluation.name} / turn ${turnIndex + 1}`
        this.logger.info(`RUN ${label}`)
        const calledBeforeTurn = calledTools.length
        toolOutputs = turn.toolOutputs ?? {}
        try {
          await session.prompt(turn.question)
          const turnTools = calledTools.slice(calledBeforeTurn)
          const result = evaluateAiAssistantTurn({
            evaluation: turn,
            calledTools: turnTools,
            assistantText: getLatestEvaluationAssistantText(session.getSessionState().messages),
          })
          const expectedCalls =
            turn.expectedToolSequence?.join(' -> ') ||
            turn.expectedTools.join(', ') ||
            'no tool call'
          if (!result.passed)
            failures.push(
              `${label}: expected ${expectedCalls}, got ${turnTools.join(' -> ') || 'no tool call'}${result.answerPassed ? '' : '; expected answer content was missing'}`
            )
          else this.logger.success(`PASS ${label}: ${turn.expectedTools.join(', ') || 'no tool'}`)
        } catch (error) {
          const failure = `${label}: ${error instanceof Error ? error.message : 'model call failed'}`
          failures.push(failure)
          this.logger.error(`FAIL ${failure}`)
        }
      }
    }
    if (failures.length) {
      failures.forEach((failure) => this.logger.error(`FAIL ${failure}`))
      this.exitCode = 1
      return
    }
    this.logger.success('All AI capability evaluations passed.')
  }
}
