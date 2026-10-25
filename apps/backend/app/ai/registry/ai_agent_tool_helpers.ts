import type { AgentTool } from '@earendil-works/pi-agent-core'
import type { TSchema } from '@earendil-works/pi-ai'
import { type z, ZodError } from 'zod'

import {
  type AiAgentActionName,
  executeAiAgentActionImmediately,
  getAiAgentAction,
} from '#ai/core/ai_agent_action_registry'
import { AiAgentPermissionDeniedError } from '#ai/core/ai_agent_authorization'
import type { AiAgentConfirmationSummary } from '#ai/core/ai_agent_confirmation'
import { AiAgentConfirmationError, proposeAiAgentAction } from '#ai/core/ai_agent_confirmation'
import type { AiAgentToolContext } from '#ai/core/ai_agent_tool_context'
import { isAiAgentTerminalToolResult } from '#ai/core/ai_agent_tool_errors'
import { getAiAgentToolSettings } from '#services/ai_agent_configuration_service'

export type AiAgentToolWithConfirmation = AgentTool & {
  prepareConfirmation?: (args: unknown) => Promise<AiAgentConfirmationSummary>
}

export function createAiAgentTool<TZodSchema extends z.ZodTypeAny, TResult>(
  execute: (input: z.infer<TZodSchema>) => Promise<TResult>,
  options: {
    name: string
    description: string
    schema: TZodSchema
    parameters: TSchema
    executionMode?: 'parallel' | 'sequential'
    prepareConfirmation?: (input: z.infer<TZodSchema>) => Promise<AiAgentConfirmationSummary>
  }
): AiAgentToolWithConfirmation {
  return {
    name: options.name,
    label: options.name,
    description: options.description,
    parameters: options.parameters,
    executionMode: options.executionMode ?? 'sequential',
    ...(options.prepareConfirmation
      ? {
          prepareConfirmation: (input: unknown) =>
            options.prepareConfirmation!(options.schema.parse(input)),
        }
      : {}),
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
          code:
            error instanceof AiAgentPermissionDeniedError ||
            (error instanceof AiAgentConfirmationError && error.status === 403)
              ? 'permission_denied'
              : error instanceof ZodError
                ? 'invalid_input'
                : 'failed',
          message,
        } as TResult
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(details) }],
        details,
        terminate: isAiAgentTerminalToolResult(options.name, details),
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

  const assertToolMode = async (toolName: string, expectedMode: 'direct' | 'confirm') => {
    const settings = await getAiAgentToolSettings()
    const setting = settings.find((tool) => tool.code === toolName)
    if (!setting?.enabled || setting.mode !== expectedMode) {
      throw new AiAgentConfirmationError('Agent 工具已停用或执行策略已更改，请重新发起', 409)
    }
  }

  const prepareManagedChange = async (
    toolName: string,
    action: AiAgentActionName,
    actionInput: Record<string, unknown>
  ) => {
    throwIfAborted()
    await assertToolMode(toolName, 'confirm')
    if (!getAiAgentAction(action)) throw new Error('无法准备受控操作')
    const confirmation = await proposeAiAgentAction({
      action,
      actionInput,
      conversationId: input.conversationId,
      userId: input.userId,
      agentRunId: input.agentRunId,
    })
    throwIfAborted()
    return confirmation
  }

  const executeManagedChange = async (
    toolName: string,
    action: AiAgentActionName,
    actionInput: Record<string, unknown>
  ) => {
    throwIfAborted()
    await assertToolMode(toolName, 'direct')
    if (
      ['create_api_key', 'create_user', 'reset_user_password'].includes(action) &&
      !input.onCredentialDisclosure
    ) {
      throw new Error('一次性凭据安全消息通道不可用，操作未执行')
    }
    if (!input.auditContext) throw new Error('缺少 Agent 审计上下文')
    const result = await executeAiAgentActionImmediately({
      action,
      actionInput,
      ctx: input.auditContext,
      onCredentialDisclosure: input.onCredentialDisclosure,
    })
    throwIfAborted()
    return { kind: 'action_result', action, ...(result ?? {}) }
  }

  return { throwIfAborted, prepareManagedChange, executeManagedChange }
}

export type AiAgentToolSupport = ReturnType<typeof createAiAgentToolSupport>
