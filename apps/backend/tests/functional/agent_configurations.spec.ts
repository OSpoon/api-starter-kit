import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'

import {
  createAiAgentTools,
  createConfiguredAiAgentTools,
} from '#ai/registry/ai_agent_tool_registry'
import AiAgentConfiguration from '#models/ai_agent_configuration'
import AiAgentConfirmation from '#models/ai_agent_confirmation'
import AiChatConversation from '#models/ai_chat_conversation'
import AiChatMessage from '#models/ai_chat_message'
import AuditLog from '#models/audit_log'
import Permission from '#models/permission'
import Role from '#models/role'
import User from '#models/user'
import { generateInitialPassword } from '#security/user_credentials'
import {
  replaceAiAgentMcpConfiguration,
  updateAiAgentMcpServer,
} from '#services/ai_agent_mcp_configuration_service'

async function createActor(permissionCodes: string[]) {
  const permissions = await Promise.all(
    permissionCodes.map((code) => Permission.findByOrFail('code', code))
  )
  const role = await Role.create({
    code: `agent-config-${crypto.randomUUID()}`,
    name: 'Agent config role',
  })
  await role.related('permissions').sync(permissions.map(({ id }) => id))
  const user = await User.create({
    fullName: 'Agent config operator',
    email: `agent-config-${crypto.randomUUID()}@example.com`,
    password: generateInitialPassword(),
  })
  await user.related('roles').sync([role.id])
  const token = await User.accessTokens.create(user)
  return token.value!.release()
}

test.group('Agent configuration', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('requires Agent configuration permissions', async ({ client }) => {
    const token = await createActor(['agent-config:read'])
    const allowed = await client.get('/api/v1/system/agent-config').bearerToken(token)
    allowed.assertStatus(200)

    const denied = await client
      .put('/api/v1/system/agent-config')
      .bearerToken(token)
      .json({ tools: [] })
    denied.assertStatus(403)
  })

  test('allows read-only tools to switch policy and always confirms managed changes', async ({
    client,
    assert,
  }) => {
    const token = await createActor(['agent-config:read', 'agent-config:update'])
    const initial = await client.get('/api/v1/system/agent-config').bearerToken(token)
    initial.assertStatus(200)
    const tools = (initial.body().data as { tools: Array<Record<string, unknown>> }).tools
    assert.isAbove(tools.length, 0)
    assert.isTrue(tools.every((tool) => typeof tool.enabled === 'boolean'))
    assert.isTrue(tools.every((tool) => tool.mode === 'direct' || tool.mode === 'confirm'))
    assert.isTrue(tools.every((tool) => typeof tool.modeConfigurable === 'boolean'))
    assert.isTrue(tools.every((tool) => typeof tool.requiresConfirmation === 'boolean'))
    assert.deepEqual(
      tools.filter((tool) => tool.modeConfigurable).map((tool) => tool.code),
      ['run_registered_query']
    )

    const updatedSettings = tools.map((tool) => ({
      ...tool,
      mode: 'direct',
      enabled: true,
    }))
    const updated = await client
      .put('/api/v1/system/agent-config')
      .bearerToken(token)
      .json({ tools: updatedSettings })
    updated.assertStatus(200)

    const saved = (
      updated.body().data as {
        tools: Array<{
          code: string
          enabled: boolean
          mode: string
          modeConfigurable: boolean
          requiresConfirmation: boolean
        }>
      }
    ).tools
    assert.isTrue(
      saved.every(
        (tool) => tool.enabled && tool.mode === (tool.requiresConfirmation ? 'confirm' : 'direct')
      )
    )

    const runtimeTools = await createConfiguredAiAgentTools({
      userId: 1,
      conversationId: 1,
      agentRunId: crypto.randomUUID(),
    })
    for (const setting of saved) {
      const runtimeTool = runtimeTools.find(({ name }) => name === setting.code) as
        | ((typeof runtimeTools)[number] & { prepareConfirmation?: unknown })
        | undefined
      assert.equal(Boolean(runtimeTool), setting.enabled, setting.code)
      if (runtimeTool) {
        assert.equal(
          typeof runtimeTool.prepareConfirmation === 'function',
          setting.mode === 'confirm',
          'confirmation hook should match configured mode for ' + setting.code
        )
      }
    }

    const confirmed = await client
      .put('/api/v1/system/agent-config')
      .bearerToken(token)
      .json({ tools: saved.map((tool) => ({ ...tool, mode: 'confirm' })) })
    confirmed.assertStatus(200)

    const confirmationTools = await createConfiguredAiAgentTools({
      userId: 1,
      conversationId: 1,
      agentRunId: crypto.randomUUID(),
    })
    const confirmedSettings = (
      confirmed.body().data as {
        tools: Array<{
          code: string
          mode: string
          modeConfigurable: boolean
          requiresConfirmation: boolean
        }>
      }
    ).tools
    assert.isTrue(
      confirmedSettings.every(
        (tool) =>
          tool.mode === (tool.modeConfigurable || tool.requiresConfirmation ? 'confirm' : 'direct')
      )
    )
    for (const setting of confirmedSettings) {
      const runtimeTool = confirmationTools.find(({ name }) => name === setting.code) as
        | ((typeof confirmationTools)[number] & { prepareConfirmation?: unknown })
        | undefined
      assert.exists(runtimeTool, setting.code)
      assert.equal(
        typeof runtimeTool!.prepareConfirmation === 'function',
        setting.mode === 'confirm',
        'confirmation hook should match configured mode for ' + setting.code
      )
    }
  })

  test('uses the Agent configuration permissions for IM settings', async ({ client }) => {
    const readerToken = await createActor(['agent-config:read'])
    const reader = await client.get('/api/v1/system/im-config').bearerToken(readerToken)
    reader.assertStatus(200)

    const deniedUpdate = await client
      .put('/api/v1/system/im-config')
      .bearerToken(readerToken)
      .json({})
    deniedUpdate.assertStatus(403)

    const updaterToken = await createActor(['agent-config:update'])
    const update = await client.put('/api/v1/system/im-config').bearerToken(updaterToken).json({})
    update.assertStatus(200)
  })

  test('saves IM channels independently without clearing other channel settings', async ({
    client,
    assert,
  }) => {
    const token = await createActor(['agent-config:update'])
    const initial = await client.put('/api/v1/system/im-config').bearerToken(token).json({
      wecomBotId: 'wecom-bot',
      wecomBotSecret: 'wecom-secret',
      wecomBotTenantId: 'wecom-tenant',
      feishuAppId: 'feishu-app',
      feishuAppSecret: 'feishu-secret',
      dingtalkClientId: 'dingtalk-client',
      dingtalkClientSecret: 'dingtalk-secret',
    })
    initial.assertStatus(200)

    const updated = await client
      .put('/api/v1/system/im-config')
      .bearerToken(token)
      .json({ feishuAppId: 'updated-feishu-app' })
    updated.assertStatus(200)
    assert.equal(updated.body().data.wecomBot.botId, 'wecom-bot')
    assert.equal(updated.body().data.feishuBot.appId, 'updated-feishu-app')
    assert.equal(updated.body().data.dingtalkBot.clientId, 'dingtalk-client')
    assert.isTrue(updated.body().data.wecomBot.secretConfigured)
    assert.isTrue(updated.body().data.feishuBot.secretConfigured)
    assert.isTrue(updated.body().data.dingtalkBot.clientSecretConfigured)
  })

  test('validates the requested LLM service before testing its connection', async ({ client }) => {
    const token = await createActor(['agent-config:update'])
    const response = await client
      .post('/api/v1/system/agent-config/llm/test')
      .bearerToken(token)
      .json({ service: 'unknown' } as never)
    response.assertStatus(422)
  })

  test('does not require or return configurable model request timeouts', async ({
    client,
    assert,
  }) => {
    const token = await createActor(['agent-config:read', 'agent-config:update'])
    const config = await client.get('/api/v1/system/agent-config/llm').bearerToken(token)
    config.assertStatus(200)
    assert.notProperty(config.body().data, 'requestTimeoutMs')

    const updated = await client.put('/api/v1/system/agent-config/llm').bearerToken(token).json({
      chatBaseUrl: null,
      chatModel: 'test-chat',
      chatContextWindow: 128000,
      chatMaxTokens: 16384,
      asrBaseUrl: null,
      asrModel: 'test-asr',
      embeddingBaseUrl: null,
      embeddingModel: null,
      embeddingDimensions: 1024,
    })
    updated.assertStatus(200)
    assert.notProperty(updated.body().data, 'requestTimeoutMs')
  })

  test('paginates skill summaries and discloses instructions only on detail', async ({
    client,
    assert,
  }) => {
    const token = await createActor(['agent-config:read', 'agent-config:update'])
    const created = await client
      .post('/api/v1/system/agent-config/skills')
      .bearerToken(token)
      .json({
        code: 'invoice-review',
        name: 'Invoice review',
        instructions: '# Invoice review\n\nReview invoice exceptions and explain discrepancies.',
        enabled: true,
      })
    created.assertStatus(200)
    const skillId = (created.body().data as { id: number }).id
    assert.equal(
      (created.body().data as { instructions: string }).instructions,
      '# Invoice review\n\nReview invoice exceptions and explain discrepancies.'
    )

    const list = await client.get('/api/v1/system/agent-config/skills').bearerToken(token)
    list.assertStatus(200)
    const skillItems = (list.body().data as { items: Array<Record<string, unknown>> }).items
    const skillSummary = skillItems.find(({ id }) => id === skillId)
    assert.exists(skillSummary)
    assert.notProperty(skillSummary!, 'instructions')
    assert.equal(skillSummary!.description, 'Review invoice exceptions and explain discrepancies.')

    const detail = await client
      .get(`/api/v1/system/agent-config/skills/${skillId}`)
      .bearerToken(token)
    detail.assertStatus(200)
    assert.equal(
      detail.body().data.instructions,
      '# Invoice review\n\nReview invoice exceptions and explain discrepancies.'
    )

    const tools = createAiAgentTools({
      userId: 1,
      conversationId: 1,
      agentRunId: crypto.randomUUID(),
    })
    const listTool = tools.find(({ name }) => name === 'list_agent_skills')!
    const listed = await listTool.execute('list-skills-test', {})
    const listedSkill = (
      listed.details as { skills: Array<{ code: string; description: string }> }
    ).skills.find(({ code }) => code === 'invoice-review')
    assert.equal(listedSkill?.description, 'Review invoice exceptions and explain discrepancies.')

    const loadTool = tools.find(({ name }) => name === 'load_agent_skill')!
    const loaded = await loadTool.execute('load-skill-test', { code: 'invoice-review' })
    assert.deepInclude(loaded.details, {
      kind: 'agent_skill',
      code: 'invoice-review',
      instructions: '# Invoice review\n\nReview invoice exceptions and explain discrepancies.',
    })

    const updated = await client
      .put(`/api/v1/system/agent-config/skills/${skillId}`)
      .bearerToken(token)
      .json({ instructions: '## Steps\n\n1. Verify the invoice total.' })
    updated.assertStatus(200)
    assert.equal(updated.body().data.description, '1. Verify the invoice total.')
    assert.equal(updated.body().data.instructions, '## Steps\n\n1. Verify the invoice total.')
  })

  test('encrypts MCP environment values and never returns them', async ({ client, assert }) => {
    const token = await createActor(['agent-config:read', 'agent-config:update'])
    const created = await client
      .put('/api/v1/system/agent-config/mcp-servers/configuration')
      .bearerToken(token)
      .json({
        mcpServers: {
          'Internal catalog': {
            command: '/usr/local/bin/internal-catalog-mcp',
            args: ['--readonly'],
            cwd: '/opt/internal-catalog-mcp',
            env: { API_TOKEN: 'do-not-return-this-token' },
          },
        },
      })
    created.assertStatus(200)
    const createdServer = (created.body().data as { items: Array<Record<string, unknown>> })
      .items[0]!
    const serverId = createdServer.id as string
    assert.isTrue(createdServer.environmentConfigured)
    assert.notProperty(created.body().data, 'environment')

    const list = await client.get('/api/v1/system/agent-config/mcp-servers').bearerToken(token)
    list.assertStatus(200)
    const serverItems = (list.body().data as { items: Array<Record<string, unknown>> }).items
    const server = serverItems.find(({ id }) => id === serverId)
    assert.exists(server)
    assert.isTrue(server!.environmentConfigured)
    assert.notProperty(server!, 'environment')

    const initialConfiguration = await AiAgentConfiguration.findOrFail(1)
    const initialServer = initialConfiguration.mcpServers['Internal catalog']!
    const preserveEnvironment = await client
      .put('/api/v1/system/agent-config/mcp-servers/configuration')
      .bearerToken(token)
      .json({
        mcpServers: {
          'Internal catalog': {
            command: '/usr/local/bin/internal-catalog-mcp',
            args: ['--readonly'],
            cwd: '/opt/internal-catalog-mcp',
          },
        },
      })
    preserveEnvironment.assertStatus(200)
    const configuration = await AiAgentConfiguration.findOrFail(1)
    const saved = configuration.mcpServers['Internal catalog']!
    assert.notInclude(saved.environment!, 'do-not-return-this-token')
    assert.deepEqual(saved.args, ['--readonly'])
    assert.equal(saved.id, initialServer.id)
    assert.equal(saved.environment, initialServer.environment)
    const configurationResponse = await client
      .get('/api/v1/system/agent-config/mcp-servers/configuration')
      .bearerToken(token)
    assert.deepEqual(configurationResponse.body().data, {
      mcpServers: {
        'Internal catalog': {
          command: '/usr/local/bin/internal-catalog-mcp',
          args: ['--readonly'],
          cwd: '/opt/internal-catalog-mcp',
        },
      },
    })
  })

  test('rejects relative MCP executable paths', async ({ client }) => {
    const token = await createActor(['agent-config:update'])
    const response = await client
      .put('/api/v1/system/agent-config/mcp-servers/configuration')
      .bearerToken(token)
      .json({
        mcpServers: { 'Invalid MCP': { command: './node', args: [] } },
      })
    response.assertStatus(422)
  })

  test('executes read MCP tools directly and runs confirmation MCP tools only after approval', async ({
    client,
    assert,
  }) => {
    const permission = await Permission.findByOrFail('code', 'agent-config:update')
    const role = await Role.create({
      code: `mcp-execution-${crypto.randomUUID()}`,
      name: 'MCP execution operator',
    })
    await role.related('permissions').sync([permission.id])
    const user = await User.create({
      fullName: 'MCP execution test',
      email: 'mcp-execution-' + crypto.randomUUID() + '@example.com',
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([role.id])
    const token = await User.accessTokens.create(user)
    const conversation = await AiChatConversation.create({
      userId: user.id,
      title: 'MCP execution test',
    })
    const assistantMessage = await AiChatMessage.create({
      conversationId: conversation.id,
      role: 'assistant',
      content: 'MCP confirmation requested.',
    })

    await AiAgentConfiguration.updateOrCreate({ id: 1 }, { enabledTools: [], toolModes: {} })
    const mcpProgram = [
      "let buffer = ''",
      "process.stdin.setEncoding('utf8')",
      "process.stdin.on('data', (chunk) => {",
      '  buffer += chunk',
      '  let newline',
      '  while ((newline = buffer.indexOf(String.fromCharCode(10))) >= 0) {',
      '    const line = buffer.slice(0, newline)',
      '    buffer = buffer.slice(newline + 1)',
      '    if (!line) continue',
      '    const request = JSON.parse(line)',
      '    if (request.id === undefined) continue',
      '    let result = {}',
      "    if (request.method === 'initialize') {",
      "      result = { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'agent-config-test', version: '1.0.0' } }",
      "    } else if (request.method === 'tools/list') {",
      '      result = { tools: [',
      "        { name: 'lookup_logs', description: 'Look up the latest log ID', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } },",
      "        { name: 'confirm_logs', description: 'Look up a protected log result', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false }, annotations: { readOnlyHint: true } },",
      "        { name: 'write_entry', description: 'Write an entry', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false } },",
      '      ] }',
      "    } else if (request.method === 'tools/call') {",
      "      result = request.params?.name === 'confirm_logs' ? { content: [], isError: false } : request.params?.name === 'write_entry' ? { content: [{ type: 'text', text: 'write-executed' }], isError: false } : { content: [{ type: 'text', text: 'latest-log-id-123' }], isError: false }",
      '    }',
      "    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + String.fromCharCode(10))",
      '  }',
      '})',
    ].join(String.fromCharCode(10))
    const [server] = await replaceAiAgentMcpConfiguration({
      'Local MCP execution test': {
        command: process.execPath,
        args: ['-e', mcpProgram],
      },
    })
    await updateAiAgentMcpServer(server!.id, {
      enabled: true,
      enabledTools: {
        lookup_logs: { mode: 'read' },
        confirm_logs: { mode: 'confirm' },
        write_entry: { mode: 'read' },
      },
    })
    const tools = await createConfiguredAiAgentTools({
      userId: user.id,
      conversationId: conversation.id,
      agentRunId: crypto.randomUUID(),
    })
    const readTool = tools.find((tool) => tool.label?.includes('lookup_logs'))
    const confirmTool = tools.find((tool) => tool.label?.includes('confirm_logs')) as
      | ((typeof tools)[number] & {
          prepareConfirmation?: (args: unknown) => Promise<{
            id: number
            action: string
            presentation: {
              title: string
              changes: Array<{ label: string; value: string }>
            }
          }>
        })
      | undefined
    const misconfiguredReadTool = tools.find((tool) => tool.label?.includes('write_entry'))
    assert.exists(readTool)
    assert.exists(confirmTool?.prepareConfirmation)
    assert.exists(misconfiguredReadTool)

    const readResult = await readTool!.execute('mcp-read-test', {})
    assert.include(
      readResult.content
        .filter((item) => item.type === 'text')
        .map((item) => item.text)
        .join(String.fromCharCode(10)),
      'latest-log-id-123'
    )
    assert.equal((readResult.details as { kind?: string }).kind, 'mcp_tool_result')

    const rejectedReadResult = await misconfiguredReadTool!.execute('mcp-write-read-test', {})
    assert.equal((rejectedReadResult.details as { kind?: string }).kind, 'action_error')
    assert.include(
      rejectedReadResult.content
        .filter((item) => item.type === 'text')
        .map((item) => item.text)
        .join(String.fromCharCode(10)),
      '必须改为确认后执行'
    )

    const proposal = await confirmTool!.prepareConfirmation!({ query: 'private search phrase' })
    assert.equal(proposal.action, 'call_mcp_tool')
    assert.equal(proposal.presentation.title, '确认调用 MCP 工具')
    assert.deepInclude(proposal.presentation.changes, {
      label: 'MCP 工具',
      value: 'confirm_logs',
    })
    assert.deepInclude(proposal.presentation.changes, {
      label: '参数字段与类型',
      value: 'query (string)',
    })
    const confirmation = await AiAgentConfirmation.findOrFail(proposal.id)
    confirmation.assistantMessageId = assistantMessage.id
    await confirmation.save()

    const response = await client
      .post(
        '/api/v1/ai-chat/conversations/' +
          conversation.id +
          '/confirmations/' +
          proposal.id +
          '/confirm/stream'
      )
      .bearerToken(token.value!.release())
    response.assertStatus(200)
    const body = response.text()
    assert.include(body, '"state":"running"')
    assert.include(body, '"state":"done"')
    assert.include(body, '"toolName":"confirm_logs"')
    assert.include(body, '"resultSummary":{"contentTypes":[],"textCharacters":0}')
    assert.notInclude(body, 'private search phrase')
    assert.include(body, 'event: done')
    const confirmedProposal = await AiAgentConfirmation.findOrFail(proposal.id)
    assert.equal(confirmedProposal.status, 'confirmed')
    const auditCount = await AuditLog.query()
      .where('action', 'agent.mcp_tool_executed')
      .where('outcome', 'success')
      .whereIn('target_id', [server!.id + ':lookup_logs', server!.id + ':confirm_logs'])
      .count('* as total')
    assert.equal(Number(auditCount[0]!.$extras.total), 2)
  })
})
