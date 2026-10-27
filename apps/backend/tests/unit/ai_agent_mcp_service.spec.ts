import type { CallToolResult } from '@earendil-works/pi-mcp'
import { test } from '@japa/runner'

import { getAiAgentMcpResultText } from '#ai/actions/ai_agent_mcp_actions'
import { assertAiAgentMcpConfiguration } from '#services/ai_agent_mcp_configuration_service'
import {
  createConfiguredMcpAgentTools,
  discoverAiAgentMcpTools,
  summarizeAiAgentMcpResult,
  validateAiAgentMcpArguments,
} from '#services/ai_agent_mcp_service'

test.group('AI agent local MCP tools', () => {
  test('extracts and bounds text for the post-confirmation assistant turn', ({ assert }) => {
    const result = getAiAgentMcpResultText({
      content: [
        { type: 'text', text: 'result' },
        { type: 'image', data: 'ignored', mimeType: 'image/png' },
      ],
      isError: false,
    } as CallToolResult)
    assert.equal(result, 'result')

    const truncated = getAiAgentMcpResultText({
      content: [{ type: 'text', text: 'x'.repeat(20_001) }],
      isError: false,
    } as CallToolResult)
    assert.lengthOf(truncated, 20_008)
    assert.equal(truncated.slice(-7), '[结果已截断]')
  })

  test('describes non-text MCP results when no text block is returned', ({ assert }) => {
    const result = getAiAgentMcpResultText({
      content: [{ type: 'image', data: 'image-data', mimeType: 'image/png' }],
      isError: false,
    } as CallToolResult)
    assert.include(result, '非文本内容')
    assert.include(result, 'image')
  })

  test('summarizes MCP result shape without retaining result values', ({ assert }) => {
    const summary = summarizeAiAgentMcpResult({
      content: [{ type: 'text', text: 'private result' }],
      structuredContent: { rows: [1, 2], nextCursor: 'private-cursor' },
      isError: false,
    } as CallToolResult)

    assert.deepEqual(summary, {
      contentTypes: ['text'],
      textCharacters: 'private result'.length,
      structuredType: 'object',
      structuredCount: 2,
    })
    assert.notInclude(JSON.stringify(summary), 'private-cursor')
    assert.notInclude(JSON.stringify(summary), 'private result')
  })

  test('validates dynamic tool arguments against the discovered JSON schema', ({ assert }) => {
    const tool = {
      name: 'lookup',
      description: 'Lookup a record',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'integer' } },
        required: ['id'],
        additionalProperties: false,
      },
      readOnlyHint: true,
    }

    assert.deepEqual(validateAiAgentMcpArguments(tool, { id: 7 }), { id: 7 })
    assert.throws(
      () => validateAiAgentMcpArguments(tool, { id: 'secret', extra: true }),
      'MCP 工具参数不符合服务端声明的结构'
    )
  })

  test('accepts command names and validates process inputs', ({ assert }) => {
    const configuration = assertAiAgentMcpConfiguration({
      command: process.execPath,
      args: ['server.js'],
      cwd: '/opt/mcp',
      environment: { LOG_LEVEL: 'info' },
    })
    assert.deepEqual(configuration, {
      command: process.execPath,
      args: ['server.js'],
      cwd: '/opt/mcp',
      environment: { LOG_LEVEL: 'info' },
    })
    assert.equal(assertAiAgentMcpConfiguration({ command: 'npx', args: [] }).command, 'npx')
    assert.throws(
      () => assertAiAgentMcpConfiguration({ command: './node', args: [] }),
      'MCP 命令必须是服务器上的绝对路径或 PATH 中的命令名'
    )
    assert.throws(
      () => assertAiAgentMcpConfiguration({ command: process.execPath, args: [], cwd: 'relative' }),
      'MCP 工作目录必须是服务器上的绝对路径'
    )
    assert.throws(
      () =>
        assertAiAgentMcpConfiguration({
          command: process.execPath,
          args: [],
          environment: { 'INVALID-NAME': 'value' },
        }),
      'MCP 环境变量无效'
    )
  })

  test('starts a local stdio MCP process and discovers its tools', async ({ assert }) => {
    const script = [
      "let buffer = '';",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', (chunk) => { buffer += chunk; let newline; while ((newline = buffer.indexOf('\\n')) >= 0) { const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1); if (!line) continue; const request = JSON.parse(line); if (request.id === undefined) continue; const result = request.method === 'initialize' ? { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'test-mcp', version: '1.0.0' } } : { tools: [{ name: 'lookup', description: 'Look up a record', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } }, { name: 'search_logs', description: 'Search logs', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } }] }; process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n'); } });",
    ].join('')

    const tools = await discoverAiAgentMcpTools({
      command: process.execPath,
      args: ['-e', script],
    })

    assert.deepEqual(tools, [
      {
        name: 'lookup',
        description: 'Look up a record',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        readOnlyHint: true,
      },
      {
        name: 'search_logs',
        description: 'Search logs',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        readOnlyHint: true,
      },
    ])

    const discoveryStatuses: Array<{ state: string; toolCount?: number; tools?: unknown[] }> = []
    const enabledTools = await createConfiguredMcpAgentTools(
      [
        {
          id: 'test-server',
          name: 'logs',
          command: process.execPath,
          args: ['-e', script],
          cwd: null,
          environment: null,
          enabled: true,
          enabledTools: { lookup: { mode: 'read' } },
          updatedAt: new Date().toISOString(),
        },
      ],
      {
        userId: 1,
        conversationId: 1,
        agentRunId: 'test-run',
        onMcpDiscovery: (status) => {
          discoveryStatuses.push(status)
        },
      }
    )

    assert.lengthOf(enabledTools, 1)
    const discovery = discoveryStatuses.find(({ state }) => state === 'done')
    assert.equal(discovery?.toolCount, 2)
    assert.deepEqual(discovery?.tools, [{ name: 'lookup', mode: 'read' }, { name: 'search_logs' }])
  })
})
