import crypto from 'node:crypto'

import encryption from '@adonisjs/core/services/encryption'
import type { CallToolResult } from '@earendil-works/pi-mcp'

import type { AiAgentActionImplementation } from '#ai/core/ai_agent_action_contracts'
import {
  defineAiAgentAction,
  getAiAgentActor,
  integer,
  string,
} from '#ai/core/ai_agent_action_helpers'
import { sanitizeAiAgentToolErrorMessage } from '#ai/core/ai_agent_tool_errors'
import type AiAgentMcpServer from '#models/ai_agent_mcp_server'
import {
  callConfiguredAiAgentMcpTool,
  discoverAiAgentMcpServerTools,
  validateAiAgentMcpArguments,
} from '#services/ai_agent_mcp_service'
import { getAiAgentMcpServer } from '#services/ai_agent_module_service'

const maxMcpResultChars = 20_000

export function getAiAgentMcpResultText(result: CallToolResult) {
  const text = result.content
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n')
  if (text.trim()) {
    if (text.length <= maxMcpResultChars) return text
    return `${text.slice(0, maxMcpResultChars)}\n[结果已截断]`
  }
  if (result.structuredContent !== undefined) {
    const structured = JSON.stringify(result.structuredContent)
    if (structured.length <= maxMcpResultChars) return structured
    return `${structured.slice(0, maxMcpResultChars)}\n[结果已截断]`
  }
  const contentTypes = [...new Set(result.content.map(({ type }) => type))]
  return contentTypes.length
    ? `MCP 工具返回了非文本内容（${contentTypes.join('、')}），当前聊天消息无法直接展示。`
    : ''
}

function record(input: Record<string, unknown>, name: string) {
  const value = input[name]
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} 无效`)
  return value as Record<string, unknown>
}

async function findTool(server: AiAgentMcpServer, name: string) {
  const tools = await discoverAiAgentMcpServerTools(server)
  const tool = tools.find((candidate) => candidate.name === name)
  if (!tool) throw new Error('MCP 服务未提供此工具')
  return tool
}

const callMcpToolAction: AiAgentActionImplementation = {
  permission: 'agent-config:update',
  async prepare(input) {
    const serverId = integer(input, 'serverId')
    const server = await getAiAgentMcpServer(serverId)
    const toolName = string(input, 'toolName', 128)
    if (!server.enabled || server.enabledTools?.[toolName]?.mode !== 'confirm') {
      throw new Error('MCP 工具已停用或未配置为确认执行')
    }
    const args = validateAiAgentMcpArguments(
      await findTool(server, toolName),
      record(input, 'arguments')
    )
    const parameterNames = Object.keys(args)
    return {
      targetType: 'mcp_server_tool',
      targetId: `mcp-confirmation:${crypto.randomUUID()}`,
      targetSummary: { name: server.name, toolName },
      payload: {
        serverId: server.id,
        toolName,
        parameterNames,
        encryptedArguments: encryption.encrypt(JSON.stringify(args)),
      },
    }
  },
  async execute({ confirmation, ctx }) {
    const actor = getAiAgentActor(ctx)
    const encryptedArguments = string(confirmation.payload, 'encryptedArguments', 100_000)
    let args: Record<string, unknown>
    try {
      const decrypted = encryption.decrypt<string>(encryptedArguments)
      if (!decrypted) throw new Error()
      const parsed: unknown = JSON.parse(decrypted)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
      args = parsed as Record<string, unknown>
    } catch {
      throw new Error('MCP 工具参数已失效，请重新发起')
    }
    const { result } = await callConfiguredAiAgentMcpTool({
      serverId: integer(confirmation.payload, 'serverId'),
      toolName: string(confirmation.payload, 'toolName', 128),
      args,
      mode: 'confirm',
      userId: actor.id,
      auditContext: ctx,
    })
    if (result.isError) {
      throw new Error(
        sanitizeAiAgentToolErrorMessage(getAiAgentMcpResultText(result)) ?? 'MCP 工具执行失败'
      )
    }
    return {
      mcpToolName: string(confirmation.payload, 'toolName', 128),
      mcpToolResult: getAiAgentMcpResultText(result),
    }
  },
}

export const aiAgentMcpActions = {
  call_mcp_tool: defineAiAgentAction(callMcpToolAction, {
    impact: 'standard',
    summarize: (payload) => [
      {
        field: 'tool_name',
        value: typeof payload.toolName === 'string' ? payload.toolName : 'unknown',
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
