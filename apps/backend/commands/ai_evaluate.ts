import { BaseCommand } from '@adonisjs/core/ace'
import { createAgent, tool } from 'langchain'
import { z } from 'zod'

import { aiAgentChangeSchema, aiApiKeyChangeSchema } from '#services/ai_agent_action_registry'
import {
  aiQueryTemplateCodes,
  aiQueryTemplateInstructions,
} from '#services/ai_agent_query_registry'
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
            description:
              'Search indexed product documentation for setup, configuration, features, or workflows.',
            schema: z.object({ query: z.string() }),
          }
        ),
        tool(remember('run_registered_query', { kind: 'query_result', rows: [] }), {
          name: 'run_registered_query',
          description: `Run one registered, permission-checked, redacted query. Templates: ${aiQueryTemplateInstructions}.`,
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
              action: 'create_api_key',
              targetSummary: { name: '演示密钥' },
            },
          }),
          {
            name: 'propose_system_management_change',
            description:
              'Prepare a management-change proposal (non-API-Key); it never executes the operation.',
            schema: aiAgentChangeSchema,
          }
        ),
        tool(
          remember('propose_api_key_revocation', {
            kind: 'confirmation',
            confirmation: {
              id: 1,
              action: 'revoke_api_key',
              targetSummary: { name: '测试密钥' },
            },
          }),
          {
            name: 'propose_api_key_revocation',
            description:
              'Prepare a proposal to revoke an active API Key; it never executes the operation.',
            schema: aiApiKeyChangeSchema,
          }
        ),
        tool(
          remember('propose_api_key_deletion', {
            kind: 'confirmation',
            confirmation: {
              id: 1,
              action: 'delete_api_key',
              targetSummary: { name: '测试密钥' },
            },
          }),
          {
            name: 'propose_api_key_deletion',
            description:
              'Prepare a proposal to delete an already-revoked API Key; it never executes the operation.',
            schema: aiApiKeyChangeSchema,
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
          const evaluationResult = evaluateAiAssistantTurn({
            evaluation: turn,
            calledTools: turnTools,
          })
          conversationMessages = [
            ...conversationMessages,
            { role: 'user', content: turn.question },
            { role: 'assistant', content: rawContent },
          ]
          if (evaluationResult.passed) {
            this.logger.success(
              `PASS ${label}: ${turn.expectedTools.join(', ') || 'no tool'} (${Math.round(performance.now() - startedAt)}ms)`
            )
          } else {
            failures.push(
              `${label}: expected ${turn.expectedTools.join(', ') || 'no tool call'}, got ${turnTools.join(', ') || 'no tool call'}`
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
