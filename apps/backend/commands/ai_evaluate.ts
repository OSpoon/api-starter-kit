import { BaseCommand } from '@adonisjs/core/ace'
import type { AgentTool } from '@earendil-works/pi-agent-core'
import { Type } from '@earendil-works/pi-ai'

import { createAiAgentSystemPrompt } from '#ai/chat/ai_agent_service'
import { isAiAgentTerminalToolResult } from '#ai/core/ai_agent_tool_errors'
import { aiAssistantEvaluationCases, evaluateAiAssistantTurn } from '#ai/evaluation/ai_evaluation'
import { aiQueryTemplateInstructions } from '#ai/registry/ai_agent_query_registry'
import { createPiAgent } from '#ai/runtime/ai_agent_pi_runtime'

function evaluationTool(
  name: string,
  description: string,
  output: () => unknown,
  calledTools: string[]
): AgentTool {
  return {
    name,
    label: name,
    description,
    parameters: Type.Any(),
    async execute() {
      calledTools.push(name)
      const details = output()
      return {
        content: [{ type: 'text', text: JSON.stringify(details) }],
        details,
        terminate: isAiAgentTerminalToolResult(name, details),
      }
    },
  }
}

function getLatestAssistantText(messages: unknown[]) {
  const message = [...messages].reverse().find((item) => {
    return Boolean(item && typeof item === 'object' && 'role' in item && item.role === 'assistant')
  }) as { content?: unknown } | undefined
  if (!message) return ''
  if (typeof message.content === 'string') return message.content
  if (!Array.isArray(message.content)) return ''

  return message.content
    .filter((part): part is { type: string; text: string } => {
      return Boolean(
        part &&
        typeof part === 'object' &&
        'type' in part &&
        'text' in part &&
        part.type === 'text' &&
        typeof part.text === 'string'
      )
    })
    .map((part) => part.text)
    .join('')
}

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
      const output = (name: string, fallback: unknown) => () => toolOutputs[name] ?? fallback
      const { agent } = await createPiAgent({
        systemPrompt: createAiAgentSystemPrompt(
          undefined,
          ' <live-session-state>{"pendingConfirmations":[]}</live-session-state>'
        ),
        tools: [
          evaluationTool(
            'diagnose_my_access',
            'Diagnose only the current authenticated user’s access to a permission.',
            output('diagnose_my_access', { allowed: true }),
            calledTools
          ),
          evaluationTool(
            'search_knowledge_catalog',
            'Search the Agent knowledge sources. Use returned document IDs in search_knowledge.',
            output('search_knowledge_catalog', {
              sources: [{ documentId: 1, title: 'Evaluation document' }],
            }),
            calledTools
          ),
          evaluationTool(
            'search_knowledge',
            'Search selected project documentation excerpts.',
            output('search_knowledge', { sources: [] }),
            calledTools
          ),
          evaluationTool(
            'run_registered_query',
            `Run one registered query for current system data. Templates: ${aiQueryTemplateInstructions}.`,
            output('run_registered_query', { kind: 'query_result', rows: [] }),
            calledTools
          ),
          evaluationTool(
            'system_management_change',
            'Perform the requested management operation using direct fields. Follow the configured execution policy.',
            output('system_management_change', { kind: 'action_result', status: 'simulated' }),
            calledTools
          ),
          evaluationTool(
            'revoke_api_key',
            'Revoke the specified API Key. Follow the configured execution policy.',
            output('revoke_api_key', { kind: 'action_result', status: 'simulated' }),
            calledTools
          ),
          evaluationTool(
            'delete_api_key',
            'Delete the specified API Key. Follow the configured execution policy.',
            output('delete_api_key', { kind: 'action_result', status: 'simulated' }),
            calledTools
          ),
        ],
      })

      for (const [turnIndex, turn] of evaluation.turns.entries()) {
        const label = `${evaluation.name} / turn ${turnIndex + 1}`
        this.logger.info(`RUN ${label}`)
        const calledBeforeTurn = calledTools.length
        toolOutputs = turn.toolOutputs ?? {}
        try {
          await agent.prompt(turn.question)
          const turnTools = calledTools.slice(calledBeforeTurn)
          const result = evaluateAiAssistantTurn({
            evaluation: turn,
            calledTools: turnTools,
            assistantText: getLatestAssistantText(agent.state.messages),
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
