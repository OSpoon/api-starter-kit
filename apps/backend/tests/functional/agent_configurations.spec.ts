import { fileURLToPath } from 'node:url'

import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { test } from '@japa/runner'

import { createConfiguredAiAgentTools } from '#ai/registry/ai_agent_tool_registry'
import AiAgentConfiguration from '#models/ai_agent_configuration'
import Permission from '#models/permission'
import Role from '#models/role'
import User from '#models/user'
import { generateInitialPassword } from '#security/user_credentials'
import { loadAiAgentSkill, removeAiAgentSkill } from '#services/ai_agent_skill_service'
import { getMineruToken, updateMineruToken } from '#services/mineru_configuration_service'

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

  test('manages MinerU credentials without disclosing them', async ({ client, assert }) => {
    const reader = await createActor(['agent-config:read'])
    const editor = await createActor(['agent-config:read', 'agent-config:update'])
    const endpoint = '/api/v1/system/agent-config/mineru'
    const secret = 'synthetic-mineru-web-token'
    await updateMineruToken(null)
    const denied = await client.put(endpoint).bearerToken(reader).json({ token: secret })
    denied.assertStatus(403)
    const missing = await client.put(endpoint).bearerToken(editor).json({ enable: true })
    missing.assertStatus(422)
    const invalid = await client.put(endpoint).bearerToken(editor).json({ token: 'bad token' })
    invalid.assertStatus(422)

    const saved = await client
      .put(endpoint)
      .bearerToken(editor)
      .json({ token: secret, enable: true })
    saved.assertStatus(200)
    saved.assertBodyContains({
      data: { mineru: { source: 'web', maskedToken: 'syntheti••••••••oken' } },
    })
    assert.notInclude(JSON.stringify(saved.body()), secret)
    assert.equal(await getMineruToken(), secret)
    const stored = await AiAgentConfiguration.findOrFail(1)
    assert.isString(stored.mineruToken)
    assert.notEqual(stored.mineruToken, secret)
    assert.isTrue(stored.enabledTools.includes('read_pdf_attachment'))

    const reused = await client.put(endpoint).bearerToken(editor).json({ enable: true })
    reused.assertStatus(200)
    assert.equal(await getMineruToken(), secret)
    const read = await client.get('/api/v1/system/agent-config').bearerToken(reader)
    read.assertStatus(200)
    read.assertBodyContains({
      data: { mineru: { source: 'web', maskedToken: 'syntheti••••••••oken' } },
    })
    assert.notInclude(JSON.stringify(read.body()), secret)

    const shortToken = await client.put(endpoint).bearerToken(editor).json({ token: 'tiny' })
    shortToken.assertStatus(200)
    shortToken.assertBodyContains({ data: { mineru: { source: 'web', maskedToken: '••••••••' } } })

    const cleared = await client.put(endpoint).bearerToken(editor).json({ token: null })
    cleared.assertStatus(200)
    cleared.assertBodyContains({ data: { mineru: { source: null, maskedToken: null } } })
    assert.isNull(await getMineruToken())
    const missingAfterClear = await client.put(endpoint).bearerToken(editor).json({ enable: true })
    missingAfterClear.assertStatus(422)
  })

  test('lists and enables the PDF tool only for eligible conversations', async ({
    client,
    assert,
  }) => {
    const token = await createActor(['agent-config:read', 'agent-config:update'])
    const endpoint = '/api/v1/system/agent-config'
    const response = await client.get(endpoint).bearerToken(token)
    response.assertStatus(200)
    const tools = (
      response.body().data as {
        tools: Array<{ code: string; enabled: boolean; mode: string; modeConfigurable: boolean }>
      }
    ).tools
    const pdf = tools.find((tool) => tool.code === 'read_pdf_attachment')
    assert.equal(pdf?.mode, 'direct')
    assert.isFalse(pdf?.modeConfigurable)
    const input = {
      userId: 1,
      conversationId: 1,
      agentRunId: 'pdf-settings',
      hasPdfAttachments: true,
    }
    const hasPdfTool = async (hasPdfAttachments = true) => {
      const registered = await createConfiguredAiAgentTools({ ...input, hasPdfAttachments })
      return registered.some(({ name }) => name === 'read_pdf_attachment')
    }
    const configured = tools.map(({ code, mode, enabled }) => ({
      code,
      mode,
      enabled: code === 'read_pdf_attachment' ? true : enabled,
    }))
    const enabled = await client.put(endpoint).bearerToken(token).json({ tools: configured })
    enabled.assertStatus(200)
    assert.isTrue(await hasPdfTool())
    assert.isFalse(await hasPdfTool(false))

    const disabled = await client
      .put(endpoint)
      .bearerToken(token)
      .json({
        tools: configured.map((tool) =>
          tool.code === 'read_pdf_attachment' ? { ...tool, enabled: false } : tool
        ),
      })
    disabled.assertStatus(200)
    assert.isFalse(await hasPdfTool())

    const legacy = await client
      .put(endpoint)
      .bearerToken(token)
      .json({
        tools: configured.filter(({ code }) => code !== 'read_pdf_attachment'),
      })
    legacy.assertStatus(200)
    assert.isFalse(await hasPdfTool())
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
      hasPdfAttachments: true,
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
      hasPdfAttachments: true,
    })
    assert.include(
      channelRuntimeTools.map(({ name }) => name),
      'bash'
    )
    assert.notInclude(
      channelRuntimeTools.map(({ name }) => name),
      'read_pdf_attachment'
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
      hasPdfAttachments: true,
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

  test('uses the IM Bot permissions for its management routes', async ({ client }) => {
    const readerToken = await createActor(['im-config:read'])
    const reader = await client.get('/api/v1/system/im-config').bearerToken(readerToken)
    reader.assertStatus(200)

    const deniedUpdate = await client
      .post('/api/v1/system/im-config')
      .bearerToken(readerToken)
      .json({
        name: 'Reader bot',
        channel: 'feishu',
        identifier: 'reader-app',
        secret: 'reader-secret',
      })
    deniedUpdate.assertStatus(403)

    const updaterToken = await createActor(['im-config:update'])
    const create = await client.post('/api/v1/system/im-config').bearerToken(updaterToken).json({
      name: 'Test Feishu bot',
      channel: 'feishu',
      identifier: 'test-feishu-app',
      secret: 'test-feishu-secret',
    })
    create.assertStatus(201)
  })

  test('stores multiple named IM bots independently without exposing secrets', async ({
    client,
    assert,
  }) => {
    const token = await createActor(['im-config:read', 'im-config:update'])
    const wecom = await client.post('/api/v1/system/im-config').bearerToken(token).json({
      name: 'WeCom support',
      channel: 'wecom',
      identifier: 'wecom-bot',
      secret: 'wecom-secret',
      tenantId: 'wecom-tenant',
    })
    wecom.assertStatus(201)
    const feishu = await client.post('/api/v1/system/im-config').bearerToken(token).json({
      name: 'Feishu support',
      channel: 'feishu',
      identifier: 'feishu-app',
      secret: 'feishu-secret',
    })
    feishu.assertStatus(201)
    const dingtalk = await client.post('/api/v1/system/im-config').bearerToken(token).json({
      name: 'DingTalk support',
      channel: 'dingtalk',
      identifier: 'dingtalk-client',
      secret: 'dingtalk-secret',
      cardTemplateId: 'action-template',
      streamingCardTemplateId: 'stream-template',
    })
    dingtalk.assertStatus(201)

    const feishuId = (feishu.body() as unknown as { data: { id: number } }).data.id
    const updated = await client
      .put(`/api/v1/system/im-config/${feishuId}`)
      .bearerToken(token)
      .json({ identifier: 'updated-feishu-app' })
    updated.assertStatus(200)
    const result = await client.get('/api/v1/system/im-config').bearerToken(token)
    result.assertStatus(200)
    const bots = (
      result.body() as {
        data: {
          items: Array<{
            name: string
            identifier: string | null
            cardTemplateId: string | null
            secretConfigured: boolean
          }>
        }
      }
    ).data.items
    assert.equal(bots.length, 3)
    assert.equal(bots.find((bot) => bot.name === 'WeCom support')?.identifier, 'wecom-bot')
    assert.equal(
      bots.find((bot) => bot.name === 'Feishu support')?.identifier,
      'updated-feishu-app'
    )
    assert.equal(
      bots.find((bot) => bot.name === 'DingTalk support')?.cardTemplateId,
      'action-template'
    )
    assert.isTrue(bots.every((bot) => bot.secretConfigured))
    assert.notProperty(bots[0], 'secret')
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

  test('installs a ZIP with bundled resources and enforces management permission', async ({
    client,
    assert,
  }) => {
    const skills = '/api/v1/system/agent-config/skills'
    const zip = (name: string) =>
      fileURLToPath(new URL(`../fixtures/skill-zip/${name}.zip`, import.meta.url))
    const reader = await createActor(['agent-config:read'])
    const editor = await createActor(['agent-config:read', 'agent-config:update'])
    const code = 'zip-upload-regression'

    const denied = await client.post(`${skills}/zip`).bearerToken(reader).file('file', zip('skill'))
    denied.assertStatus(403)
    for (const invalid of ['traversal', 'symlink']) {
      const response = await client
        .post(`${skills}/zip`)
        .bearerToken(editor)
        .file('file', zip(invalid))
      response.assertStatus(422)
    }
    const installed = await client
      .post(`${skills}/zip`)
      .bearerToken(editor)
      .file('file', zip('skill'))
    installed.assertStatus(200)
    let removed = false
    try {
      installed.assertBodyContains({ data: { installed: [{ code, name: code }] } })
      await assert.rejects(() => loadAiAgentSkill(code, 'references/guide.md'))
      const duplicate = await client
        .post(`${skills}/zip`)
        .bearerToken(editor)
        .file('file', zip('skill'))
      duplicate.assertStatus(409)
      const enabled = await client
        .put(`${skills}/${code}`)
        .bearerToken(editor)
        .json({ enabled: true })
      enabled.assertStatus(200)
      assert.equal(await loadAiAgentSkill(code, 'references/guide.md'), 'Bundled guidance.')
      const deleted = await client.delete(`${skills}/${code}`).bearerToken(editor)
      deleted.assertStatus(200)
      removed = true
      await assert.rejects(() => loadAiAgentSkill(code, 'references/guide.md'))
    } finally {
      if (!removed) await removeAiAgentSkill(code)
    }
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
