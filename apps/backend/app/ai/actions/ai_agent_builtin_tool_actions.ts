import crypto from 'node:crypto'

import encryption from '@adonisjs/core/services/encryption'

import type { AiAgentActionImplementation } from '#ai/core/ai_agent_action_contracts'
import { defineAiAgentAction, getAiAgentActor, string } from '#ai/core/ai_agent_action_helpers'
import {
  builtInAiAgentToolNames,
  builtInAiAgentToolsRequiringConfirmation,
} from '#ai/core/ai_agent_tool_catalog'
import type { AiAgentToolContext } from '#ai/core/ai_agent_tool_context'
import type { AiAgentKnowledgeSource } from '#ai/core/ai_agent_tool_context'
import { getAiAgentToolSettings } from '#services/ai_agent_configuration_service'

const readableToolNames = builtInAiAgentToolNames.filter(
  (name) => !builtInAiAgentToolsRequiringConfirmation.some((tool) => tool === name)
)

function object(input: Record<string, unknown>, key: string) {
  const value = input[key]
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${key} 无效`)
  return value as Record<string, unknown>
}

function documentIds(input: Record<string, unknown>) {
  const value = input.knowledgeCatalogDocumentIds
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((id) => !Number.isSafeInteger(id) || Number(id) <= 0)) {
    throw new Error('知识目录范围无效')
  }
  return value as number[]
}

async function assertConfirmationMode(toolName: string) {
  const settings = await getAiAgentToolSettings()
  const setting = settings.find((tool) => tool.code === toolName)
  if (!setting?.enabled || setting.mode !== 'confirm') {
    throw new Error('Agent 工具已停用或执行策略已更改，请重新发起')
  }
}

const callBuiltInToolAction: AiAgentActionImplementation = {
  permission: 'agent-config:read',
  async prepare(input) {
    const toolName = string(input, 'toolName', 128)
    if (!readableToolNames.includes(toolName as (typeof readableToolNames)[number])) {
      throw new Error('该内置工具不支持确认后读取')
    }
    await assertConfirmationMode(toolName)
    const args = object(input, 'arguments')
    const ids = documentIds(input)
    const skillCode = toolName === 'load_agent_skill' ? string(args, 'code', 64) : undefined
    return {
      targetType: 'agent_tool',
      targetId: `${toolName}:${crypto.randomUUID()}`,
      targetSummary: { name: skillCode ?? toolName },
      payload: {
        toolName,
        ...(skillCode ? { skillCode } : {}),
        parameterNames: Object.keys(args),
        encryptedArguments: encryption.encrypt(
          JSON.stringify({ args, knowledgeCatalogDocumentIds: ids })
        ),
      },
    }
  },

  async execute({ confirmation, ctx }) {
    const toolName = string(confirmation.payload, 'toolName', 128)
    await assertConfirmationMode(toolName)
    const encryptedArguments = string(confirmation.payload, 'encryptedArguments', 100_000)
    let args: Record<string, unknown>
    let knowledgeCatalogDocumentIds: number[]
    try {
      const decrypted = encryption.decrypt<string>(encryptedArguments)
      if (!decrypted) throw new Error()
      const parsed: unknown = JSON.parse(decrypted)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
      const payload = parsed as Record<string, unknown>
      args = object(payload, 'args')
      knowledgeCatalogDocumentIds = documentIds(payload)
    } catch {
      throw new Error('Agent 工具参数已失效，请重新发起')
    }

    const actor = getAiAgentActor(ctx)
    const sources: AiAgentKnowledgeSource[] = []
    const toolContext: AiAgentToolContext = {
      userId: actor.id,
      conversationId: confirmation.conversationId,
      agentRunId: confirmation.agentRunId,
      auditContext: ctx,
      knowledgeCatalogDocumentIds: new Set(knowledgeCatalogDocumentIds),
      onKnowledgeSources: (items) => sources.push(...items),
    }
    const { createAiAgentTools } = await import('#ai/registry/ai_agent_tool_registry')
    const tool = createAiAgentTools(toolContext).find((candidate) => candidate.name === toolName)
    if (!tool) throw new Error('Agent 工具不可用，请重新发起')
    const result = await tool.execute(`confirmation:${confirmation.id}`, args)
    const details = result.details as { kind?: unknown; message?: unknown } | undefined
    if (details?.kind === 'action_error' || details?.kind === 'query_error') {
      throw new Error(typeof details.message === 'string' ? details.message : 'Agent 工具读取失败')
    }
    const text = result.content
      .filter((item) => item.type === 'text')
      .map((item) => item.text)
      .join('\n')
    return {
      agentToolName: toolName,
      agentToolResult: text.length > 20_000 ? `${text.slice(0, 20_000)}\n[结果已截断]` : text,
      ...(toolName === 'load_agent_skill' ? { agentSkillCode: args.code } : {}),
      ...(sources.length ? { agentToolSources: sources } : {}),
    }
  },
}

export const aiAgentBuiltInToolActions = {
  call_builtin_tool: defineAiAgentAction(callBuiltInToolAction, {
    impact: 'standard',
    summarize: (payload) => [
      {
        field: typeof payload.skillCode === 'string' ? 'skill' : 'tool_name',
        value:
          typeof payload.skillCode === 'string'
            ? payload.skillCode
            : typeof payload.toolName === 'string'
              ? payload.toolName
              : 'unknown',
      },
      {
        field: 'parameter_names',
        value: Array.isArray(payload.parameterNames)
          ? payload.parameterNames.join(', ')
          : 'not_set',
      },
    ],
  }),
}
