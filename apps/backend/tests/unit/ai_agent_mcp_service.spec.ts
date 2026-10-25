import type { CallToolResult } from '@earendil-works/pi-mcp'
import { test } from '@japa/runner'

import { getAiAgentMcpResultText } from '#ai/actions/ai_agent_mcp_actions'
import {
  assertAiAgentMcpConfiguration,
  discoverAiAgentMcpTools,
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

  test('requires an absolute executable path and validates local process inputs', ({ assert }) => {
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
    assert.throws(
      () => assertAiAgentMcpConfiguration({ command: 'node', args: [] }),
      'MCP 命令必须是服务器上的绝对路径'
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
      "process.stdin.on('data', (chunk) => { buffer += chunk; let newline; while ((newline = buffer.indexOf('\\n')) >= 0) { const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1); if (!line) continue; const request = JSON.parse(line); if (request.id === undefined) continue; const result = request.method === 'initialize' ? { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'test-mcp', version: '1.0.0' } } : { tools: [{ name: 'lookup', description: 'Look up a record', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } }] }; process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n'); } });",
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
    ])
  })
})
