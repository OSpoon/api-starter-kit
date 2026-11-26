import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'

import AiAutomation from '#models/ai_automation'
import Permission from '#models/permission'
import Role from '#models/role'
import User from '#models/user'
import { generateInitialPassword } from '#security/user_credentials'

test.group('AI automation management', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('switches webhook format, preserves its URL, and protects it from read-only users', async ({
    client,
    assert,
  }) => {
    const permissions = await Permission.query()
      .whereIn('code', ['ai-automations:read', 'ai-automations:manage', 'ai-automations:run'])
      .select('id', 'code')
    const permissionId = (code: string) =>
      permissions.find((permission) => permission.code === code)!.id
    const role = await Role.create({
      code: `automation-${crypto.randomUUID()}`,
      name: 'Automation manager',
    })
    await role
      .related('permissions')
      .sync([permissionId('ai-automations:read'), permissionId('ai-automations:manage')])
    const user = await User.create({
      fullName: 'Automation manager',
      email: `automation-${crypto.randomUUID()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([role.id])
    const token = await User.accessTokens.create(user)
    const tokenValue = token.value!.release()
    const webhookUrl = 'https://example.com/webhook'

    const created = await client
      .post('/api/v1/system/ai-automations')
      .bearerToken(tokenValue)
      .json({
        name: 'Switch delivery format',
        prompt: 'Return a short status.',
        schedule: { cron: '*/5 * * * *' },
        webhookType: 'generic',
        webhookUrl,
      })
    created.assertStatus(200)
    const createdAutomation = (
      created.body() as unknown as { data: { id: number; webhookType: string; webhookUrl: string } }
    ).data
    assert.equal(createdAutomation.webhookType, 'generic')
    assert.equal(createdAutomation.webhookUrl, webhookUrl)

    const automation = await AiAutomation.findOrFail(createdAutomation.id)
    const encryptedWebhookUrl = automation.encryptedWebhookUrl
    const updated = await client
      .put(`/api/v1/system/ai-automations/${automation.id}`)
      .bearerToken(tokenValue)
      .json({
        name: automation.name,
        prompt: automation.prompt,
        schedule: { cron: '*/5 * * * *' },
        webhookType: 'wecom',
        enabled: true,
      })
    updated.assertStatus(200)
    const updatedAutomation = (
      updated.body() as unknown as { data: { webhookType: string; webhookUrl: string } }
    ).data
    assert.equal(updatedAutomation.webhookType, 'wecom')
    assert.equal(updatedAutomation.webhookUrl, webhookUrl)
    await automation.refresh()
    assert.equal(automation.encryptedWebhookUrl, encryptedWebhookUrl)

    const deniedRun = await client
      .post(`/api/v1/system/ai-automations/${automation.id}/run`)
      .bearerToken(tokenValue)
    deniedRun.assertStatus(403)

    await role
      .related('permissions')
      .sync([
        permissionId('ai-automations:read'),
        permissionId('ai-automations:manage'),
        permissionId('ai-automations:run'),
      ])
    const run = await client
      .post(`/api/v1/system/ai-automations/${automation.id}/run`)
      .bearerToken(tokenValue)
    run.assertStatus(200)

    await role.related('permissions').sync([permissionId('ai-automations:read')])
    const list = await client.get('/api/v1/system/ai-automations').bearerToken(tokenValue)
    list.assertStatus(200)
    const listedAutomation = (
      list.body() as unknown as {
        data: { items: Array<{ id: number; webhookUrl: string | null }> }
      }
    ).data.items.find(({ id }) => id === automation.id)
    assert.isNotNull(listedAutomation)
    assert.isNull(listedAutomation!.webhookUrl)
  })
})
