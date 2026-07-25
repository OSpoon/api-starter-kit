import { BaseCommand } from '@adonisjs/core/ace'
import { createAgent, tool } from 'langchain'
import { z } from 'zod'

import { aiAgentChangeSchema } from '#services/ai_agent_action_registry'
import { resolveGroundedAssistantResponse } from '#services/ai_agent_response_policy'
import { createAiAgentModel, createAiAgentSystemPrompt } from '#services/ai_agent_service'

type EvaluationCase = {
  name: string
  question: string
  expectedTool: string | null
  expectedResponse: 'grounded' | 'scope'
  toolOutputs?: Record<string, unknown>
}

const evaluationCases: EvaluationCase[] = [
  {
    name: 'knowledge document',
    question: '找一下 API Starter Kit 所用的技术栈。',
    expectedTool: 'search_knowledge',
    expectedResponse: 'grounded',
  },
  {
    name: 'product guidance',
    question: '如何启动 API Starter Kit 项目？',
    expectedTool: 'search_knowledge',
    expectedResponse: 'grounded',
  },
  {
    name: 'workflow guidance',
    question: '如何配置 API Key？',
    expectedTool: 'search_knowledge',
    expectedResponse: 'grounded',
  },
  {
    name: 'current system fact',
    question: '列出当前有效的 API Key。',
    expectedTool: 'list_api_keys',
    expectedResponse: 'grounded',
  },
  {
    name: 'controlled operation',
    question: '请吊销 ID 为 19 的测试密钥。',
    expectedTool: 'propose_system_management_change',
    expectedResponse: 'grounded',
  },
  {
    name: 'out of scope',
    question: '用三句话解释最小权限原则。',
    expectedTool: null,
    expectedResponse: 'scope',
  },
  {
    name: 'permission denied change',
    question: '请吊销 ID 为 19 的测试密钥。',
    expectedTool: 'propose_system_management_change',
    expectedResponse: 'grounded',
    toolOutputs: {
      propose_system_management_change: {
        kind: 'action_error',
        message: '当前账号没有执行此操作的权限',
      },
    },
  },
]

/** Uses mock tools only; cases share one history and never mutate business data. */
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
            description: 'Search published product setup and workflow documentation.',
            schema: z.object({ query: z.string() }),
          }
        ),
        tool(remember('list_api_keys', [{ id: 28, name: '测试密钥', prefix: 'id_test' }]), {
          name: 'list_api_keys',
          description: 'List current active API Key metadata.',
          schema: z.object({}),
        }),
        tool(remember('list_users', []), {
          name: 'list_users',
          description: 'List current managed users and roles.',
          schema: z.object({ limit: z.number().int().min(1).max(100).default(50) }),
        }),
        tool(remember('list_roles', []), {
          name: 'list_roles',
          description: 'List current roles and assigned permissions.',
          schema: z.object({}),
        }),
        tool(remember('list_permissions', []), {
          name: 'list_permissions',
          description: 'List the current permission catalog.',
          schema: z.object({}),
        }),
        tool(remember('list_audit_logs', []), {
          name: 'list_audit_logs',
          description: 'List recent audit events.',
          schema: z.object({ limit: z.number().int().min(1).max(100).default(30) }),
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
    let conversationMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []
    for (const evaluation of evaluationCases) {
      this.logger.info(`RUN ${evaluation.name}`)
      const calledBeforeTurn = calledTools.length
      const startedAt = performance.now()
      let result: Awaited<ReturnType<typeof agent.invoke>> | null = null
      toolOutputs = evaluation.toolOutputs ?? {}

      try {
        result = await agent.invoke({
          messages: [
            ...conversationMessages,
            { role: 'user' as const, content: evaluation.question },
          ],
        })
      } catch (error) {
        const failure = `${evaluation.name}: ${error instanceof Error ? error.message : 'model call failed'}`
        failures.push(failure)
        this.logger.error(`FAIL ${failure}`)
        continue
      }
      const turnTools = calledTools.slice(calledBeforeTurn)
      const toolPassed = evaluation.expectedTool
        ? turnTools.includes(evaluation.expectedTool)
        : turnTools.length === 0
      const lastMessage = result.messages.at(-1)
      const rawContent = typeof lastMessage?.content === 'string' ? lastMessage.content : ''
      const response = resolveGroundedAssistantResponse({
        content: rawContent,
        completedToolNames: new Set(turnTools),
      })
      const responsePassed =
        evaluation.expectedResponse === 'grounded'
          ? response === rawContent
          : response !== rawContent
      conversationMessages = [
        ...conversationMessages,
        { role: 'user', content: evaluation.question },
        { role: 'assistant', content: response },
      ]
      if (toolPassed && responsePassed) {
        this.logger.success(
          `PASS ${evaluation.name}: ${evaluation.expectedTool ?? 'scope guard'} (${Math.round(performance.now() - startedAt)}ms)`
        )
      } else {
        failures.push(
          `${evaluation.name}: expected ${evaluation.expectedTool ?? 'no tool'} and ${evaluation.expectedResponse} response, got ${turnTools.join(', ') || 'no tool call'} and ${response === rawContent ? 'grounded' : 'scope'} response`
        )
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
