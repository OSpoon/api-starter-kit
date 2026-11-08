import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { test } from '@japa/runner'

import { createConfiguredAiAgentTools } from '#ai/registry/ai_agent_tool_registry'
import Permission from '#models/permission'
import Role from '#models/role'
import User from '#models/user'
import { generateInitialPassword } from '#security/user_credentials'

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
      enabledToolNames: saved.map(({ code }) => code),
    })
    assert.include(
      runtimeTools.map(({ name }) => name),
      'list_agent_skills'
    )
    assert.include(
      runtimeTools.map(({ name }) => name),
      'load_agent_skill'
    )
    assert.include(
      runtimeTools.map(({ name }) => name),
      'bash'
    )
    const channelRuntimeTools = await createConfiguredAiAgentTools({
      userId: 1,
      conversationId: 1,
      agentRunId: crypto.randomUUID(),
      capabilityMode: 'channel',
    })
    assert.include(
      channelRuntimeTools.map(({ name }) => name),
      'bash'
    )
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

  test('manages skills through the CLI-backed directory without a skills table', async ({
    client,
    assert,
  }) => {
    const unauthorizedToken = await createActor([])
    const deniedList = await client
      .get('/api/v1/system/agent-config/skills')
      .bearerToken(unauthorizedToken)
    deniedList.assertStatus(403)

    const readerToken = await createActor(['agent-config:read'])
    const listed = await client.get('/api/v1/system/agent-config/skills').bearerToken(readerToken)
    listed.assertStatus(200)
    assert.isArray((listed.body().data as { items: unknown[] }).items)
    assert.property(listed.body().data as { meta: object }, 'meta')

    const deniedInstall = await client
      .post('/api/v1/system/agent-config/skills')
      .bearerToken(readerToken)
      .json({ source: 'vercel-labs/agent-skills' })
    deniedInstall.assertStatus(403)
    const deniedToggle = await client
      .put('/api/v1/system/agent-config/skills/not-installed')
      .bearerToken(readerToken)
      .json({ enabled: true })
    deniedToggle.assertStatus(403)
    const deniedRemoval = await client
      .delete('/api/v1/system/agent-config/skills/not-installed')
      .bearerToken(readerToken)
    deniedRemoval.assertStatus(403)

    const updaterToken = await createActor(['agent-config:read', 'agent-config:update'])
    const invalidInstall = await client
      .post('/api/v1/system/agent-config/skills')
      .bearerToken(updaterToken)
      .json({ source: 'https://example.com/skills.zip' })
    invalidInstall.assertStatus(422)
    const missingToggle = await client
      .put('/api/v1/system/agent-config/skills/not-installed')
      .bearerToken(updaterToken)
      .json({ enabled: true })
    missingToggle.assertStatus(404)
    const missingRemoval = await client
      .delete('/api/v1/system/agent-config/skills/not-installed')
      .bearerToken(updaterToken)
    missingRemoval.assertStatus(404)

    const configuration = await client.get('/api/v1/system/agent-config').bearerToken(updaterToken)
    configuration.assertStatus(200)
    const toolCodes = (configuration.body().data as { tools: Array<{ code: string }> }).tools.map(
      ({ code }) => code
    )
    assert.notInclude(toolCodes, 'list_agent_skills')
    assert.notInclude(toolCodes, 'load_agent_skill')

    const schema = await db.rawQuery("SELECT to_regclass('ai_agent_skills') AS table_name")
    assert.isNull(schema.rows[0]?.table_name)
  })
})
