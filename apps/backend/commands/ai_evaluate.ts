import { BaseCommand } from '@adonisjs/core/ace'
import type { AgentTool } from '@earendil-works/pi-agent-core'
import { Type } from '@earendil-works/pi-ai'

import { createAiAgentSystemPrompt } from '#ai/chat/ai_agent_service'
import { aiAssistantEvaluationCases, evaluateAiAssistantTurn } from '#ai/evaluation/ai_evaluation'
import { aiQueryTemplateInstructions } from '#ai/registry/ai_agent_query_registry'
import { createPiAgent } from '#ai/runtime/ai_agent_pi_runtime'

function evaluationTool(
  name: string,
  description: string,
  output: () => unknown,
  onCall: () => void
): AgentTool {
  return {
    name,
    label: name,
    description,
    parameters: Type.Any(),
    async execute() {
      onCall()
      const details = output()
      return { content: [{ type: 'text', text: JSON.stringify(details) }], details }
    },
  }
}

/** Uses mock tools only; each scenario has isolated history and never mutates business data. */
export default class AiEvaluate extends BaseCommand {
  static commandName = 'ai:evaluate'
  static description = 'Validate the configured AI model against core assistant tool-use scenarios'
  static options = { startApp: true }

  async run() {
    const failures: string[] = []
    const calledTools: string[] = []
    let toolOutputs: Record<string, unknown> = {}
    const remember = (name: string, fallback: unknown) => () => {
      calledTools.push(name)
      return toolOutputs[name] ?? fallback
    }
    const { agent } = await createPiAgent({
      systemPrompt: createAiAgentSystemPrompt(
        undefined,
        ' <live-session-state>{"pendingConfirmations":[]}</live-session-state>'
      ),
      tools: [
        evaluationTool(
          'diagnose_my_access',
          'Diagnose current user access.',
          () => ({ allowed: true }),
          () => calledTools.push('diagnose_my_access')
        ),
        evaluationTool(
          'search_knowledge',
          'Search product documentation.',
          remember('search_knowledge', { sources: [] }),
          () => {}
        ),
        evaluationTool(
          'run_registered_query',
          `Run a registered query. Templates: ${aiQueryTemplateInstructions}.`,
          remember('run_registered_query', { kind: 'query_result', rows: [] }),
          () => {}
        ),
        evaluationTool(
          'propose_system_management_change',
          'Prepare a management proposal.',
          remember('propose_system_management_change', { kind: 'confirmation' }),
          () => {}
        ),
        evaluationTool(
          'propose_api_key_revocation',
          'Prepare an API key revocation proposal.',
          remember('propose_api_key_revocation', { kind: 'confirmation' }),
          () => {}
        ),
        evaluationTool(
          'propose_api_key_deletion',
          'Prepare an API key deletion proposal.',
          remember('propose_api_key_deletion', { kind: 'confirmation' }),
          () => {}
        ),
      ],
    })

    for (const evaluation of aiAssistantEvaluationCases) {
      for (const [turnIndex, turn] of evaluation.turns.entries()) {
        const label = `${evaluation.name} / turn ${turnIndex + 1}`
        this.logger.info(`RUN ${label}`)
        const calledBeforeTurn = calledTools.length
        toolOutputs = turn.toolOutputs ?? {}
        try {
          await agent.prompt(turn.question)
          const turnTools = calledTools.slice(calledBeforeTurn)
          const result = evaluateAiAssistantTurn({ evaluation: turn, calledTools: turnTools })
          if (!result.passed)
            failures.push(
              `${label}: expected ${turn.expectedTools.join(', ') || 'no tool call'}, got ${turnTools.join(', ') || 'no tool call'}`
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
