import type { AgentTool } from '@earendil-works/pi-agent-core'
import type { TSchema } from '@earendil-works/pi-ai'
import { type z } from 'zod'

import { type AiAgentActionName, getAiAgentAction } from '#ai/core/ai_agent_action_registry'
import { ensureAiAgentPermission } from '#ai/core/ai_agent_authorization'
import {
  AiAgentConfirmationError,
  createAiAgentActionToolResult,
  proposeAiAgentAction,
} from '#ai/core/ai_agent_confirmation'
import type { AiAgentToolContext } from '#ai/core/ai_agent_tool_context'

export function createAiAgentTool<TZodSchema extends z.ZodTypeAny, TResult>(
  execute: (input: z.infer<TZodSchema>) => Promise<TResult>,
  options: {
    name: string
    description: string
    schema: TZodSchema
    parameters: TSchema
    executionMode?: 'parallel' | 'sequential'
  }
): AgentTool {
  return {
    name: options.name,
    label: options.name,
    description: options.description,
    parameters: options.parameters,
    executionMode: options.executionMode ?? 'sequential',
    execute: async (_toolCallId, input, signal) => {
      if (signal?.aborted) throw new DOMException('AI request was cancelled', 'AbortError')
      let details: TResult
      try {
        details = await execute(options.schema.parse(input))
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error
        const message = error instanceof Error ? error.message : '工具参数或执行结果无效'
        details = {
          kind: 'action_error',
          code: /权限|permission/i.test(message) ? 'permission_denied' : 'invalid_input',
          message,
        } as TResult
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(details) }],
        details,
        terminate:
          details !== null &&
          typeof details === 'object' &&
          'kind' in details &&
          ['confirmation', 'action_error', 'query_error'].includes(
            String((details as { kind?: unknown }).kind)
          ),
      }
    },
  }
}

export function createAiAgentToolSupport(input: AiAgentToolContext) {
  const throwIfAborted = () => {
    if (input.signal?.aborted) {
      throw new DOMException('AI request was cancelled', 'AbortError')
    }
  }

  const proposeManagedChange = async (
    action: AiAgentActionName,
    actionInput: Record<string, unknown>
  ) => {
    try {
      throwIfAborted()
      const definition = getAiAgentAction(action)
      if (!definition) throw new Error('无法准备受控操作')
      await ensureAiAgentPermission(input.userId, definition.permission)
      const confirmation = await proposeAiAgentAction({
        action,
        actionInput,
        conversationId: input.conversationId,
        userId: input.userId,
        agentRunId: input.agentRunId,
      })
      throwIfAborted()
      return createAiAgentActionToolResult({ kind: 'confirmation', confirmation })
    } catch (error) {
      const message = error instanceof Error ? error.message : '无法准备受控操作'
      const isPermissionDenied = message === '当前账号没有执行此操作的权限'
      if (error instanceof AiAgentConfirmationError || isPermissionDenied) {
        return createAiAgentActionToolResult({
          kind: 'action_error',
          code:
            (error instanceof AiAgentConfirmationError && error.status === 403) ||
            isPermissionDenied
              ? 'permission_denied'
              : 'failed',
          message,
        })
      }
      return createAiAgentActionToolResult({ kind: 'action_error', code: 'failed', message })
    }
  }

  return { throwIfAborted, proposeManagedChange }
}

export type AiAgentToolSupport = ReturnType<typeof createAiAgentToolSupport>
