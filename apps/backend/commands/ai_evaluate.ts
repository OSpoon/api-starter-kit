import { BaseCommand } from '@adonisjs/core/ace'
import { createAgent, tool } from 'langchain'
import { z } from 'zod'

import { aiAgentChangeSchema } from '#services/ai_agent_action_registry'
import {
  aiQueryTemplateCodes,
  aiQueryTemplateInstructions,
} from '#services/ai_agent_query_registry'
import { resolveGroundedAssistantResponse } from '#services/ai_agent_response_policy'
import { createAiAgentModel, createAiAgentSystemPrompt } from '#services/ai_agent_service'
import { aiAssistantEvaluationCases, evaluateAiAssistantTurn } from '#services/ai_evaluation'

/** Uses mock tools only; each scenario has isolated history and never mutates business data. */
export default class AiEvaluate extends BaseCommand {
  static commandName = 'ai:evaluate'
  static description = 'Validate the configured AI model against core assistant tool-use scenarios'
  static options = { startApp: true }

  async run() {
    const failures: string[] = []
    const calledTools: string[] = []
    let toolOutputs: Record<string, unknown> = {}
    const remember = (name: string, output: unknown) => async () => {
      calledTools.push(name)
      return JSON.stringify(toolOutputs[name] ?? output)
    }
    const agent = createAgent({
      model: createAiAgentModel(),
      systemPrompt: createAiAgentSystemPrompt(
        undefined,
        ' <authorization-context>Current server-side permissions: ["*"]</authorization-context>',
        ' <live-session-state>{"pendingConfirmations":[]}</live-session-state>'
      ),
      tools: [
        tool(remember('diagnose_my_access', { allowed: true }), {
          name: 'diagnose_my_access',
          description: 'Diagnose the current authenticated user access.',
          schema: z.object({ permissionCode: z.string().optional() }),
        }),
        tool(
          remember('search_knowledge', {
            sources: [
              {
                title: 'README',
                excerpt: 'Run pnpm install, configure apps/backend/.env, then run pnpm dev.',
              },
            ],
          }),
          {
            name: 'search_knowledge',
            description: 'Search indexed product setup and workflow documentation.',
            schema: z.object({ query: z.string() }),
          }
        ),
        tool(remember('run_registered_query', { kind: 'query_result', rows: [] }), {
          name: 'run_registered_query',
          description: `Run a registered, permission-checked and redacted database query. Available templates: ${aiQueryTemplateInstructions}`,
          schema: z.object({
            templateCode: z.enum(aiQueryTemplateCodes),
            params: z.record(z.unknown()).default({}),
          }),
        }),
        tool(
          remember('propose_system_management_change', {
            kind: 'confirmation',
            confirmation: {
              id: 1,
              action: 'revoke_api_key',
              targetSummary: { name: '测试密钥' },
            },
          }),
          {
            name: 'propose_system_management_change',
            description: 'Prepare a management-change proposal; it never executes the operation.',
            schema: aiAgentChangeSchema,
          }
        ),
      ],
    })
    for (const evaluation of aiAssistantEvaluationCases) {
      let conversationMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []
      for (const [turnIndex, turn] of evaluation.turns.entries()) {
        const label = `${evaluation.name} / turn ${turnIndex + 1}`
        this.logger.info(`RUN ${label}`)
        const calledBeforeTurn = calledTools.length
        const startedAt = performance.now()
        toolOutputs = turn.toolOutputs ?? {}

        try {
          const result = await agent.invoke({
            messages: [...conversationMessages, { role: 'user' as const, content: turn.question }],
          })
          const turnTools = calledTools.slice(calledBeforeTurn)
          const lastMessage = result.messages.at(-1)
          const rawContent = typeof lastMessage?.content === 'string' ? lastMessage.content : ''
          const response = resolveGroundedAssistantResponse({
            content: rawContent,
            completedToolNames: new Set(turnTools),
          })
          const evaluationResult = evaluateAiAssistantTurn({
            evaluation: turn,
            calledTools: turnTools,
            rawContent,
            response,
          })
          conversationMessages = [
            ...conversationMessages,
            { role: 'user', content: turn.question },
            { role: 'assistant', content: response },
          ]
          if (evaluationResult.passed) {
            this.logger.success(
              `PASS ${label}: ${turn.expectedTools.join(', ') || 'scope guard'} (${Math.round(performance.now() - startedAt)}ms)`
            )
          } else {
            failures.push(
              `${label}: expected ${turn.expectedTools.join(', ') || 'no tool'} and ${turn.expectedResponse} response, got ${turnTools.join(', ') || 'no tool call'} and ${response === rawContent ? 'grounded' : 'scope'} response`
            )
          }
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
