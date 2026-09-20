import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'

import Role from '#models/role'
import User from '#models/user'
import WecomMessageTemplate from '#models/wecom_message_template'
import { generateInitialPassword } from '#security/user_credentials'
import { encryptWebhookUrl } from '#services/wecom_message_template_service'

test.group('WeCom message templates', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('searches templates on the server before pagination', async ({ client, assert }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const user = await User.create({
      fullName: 'Template search admin',
      email: `template-search-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([superAdminRole.id])
    const token = await User.accessTokens.create(user)

    const searchId = String(Date.now())
    const matchedTemplate = await WecomMessageTemplate.create({
      name: `Searchable ${searchId}`,
      description: 'Template for server-side search',
      msgtype: 'text',
      webhookUrl: encryptWebhookUrl('https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=secret'),
      payload: { msgtype: 'text', text: { content: 'Hello' } },
      parameters: [],
      enabled: true,
    })
    await WecomMessageTemplate.create({
      name: 'Unrelated template',
      description: 'Other template',
      msgtype: 'markdown',
      webhookUrl: encryptWebhookUrl('https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=secret'),
      payload: { msgtype: 'markdown', markdown: { content: 'Hello' } },
      parameters: [],
      enabled: true,
    })

    const response = await client
      .get(`/api/v1/system/wecom-message-templates?search=${searchId}&page=1&limit=1`)
      .bearerToken(token.value!.release())

    response.assertStatus(200)
    const body = response.body().data as {
      items: Array<{ id: number; name: string }>
      meta: { total: number }
    }
    assert.deepEqual(
      body.items.map((item) => item.id),
      [matchedTemplate.id]
    )
    assert.equal(body.meta.total, 1)
  })
})
