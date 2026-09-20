import crypto from 'node:crypto'

import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'

import ApiKey from '#models/api_key'
import AuditLog from '#models/audit_log'
import Role from '#models/role'
import User from '#models/user'
import WecomMessageTemplate from '#models/wecom_message_template'
import { generateInitialPassword } from '#security/user_credentials'
import { hashApiKey } from '#services/api_key_service'
import { encryptWebhookUrl } from '#services/wecom_message_template_service'

test.group('WeCom message send audit', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  async function createTemplate() {
    return WecomMessageTemplate.create({
      name: 'Audited send',
      msgtype: 'text',
      webhookUrl: encryptWebhookUrl(
        `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${crypto.randomUUID()}`
      ),
      payload: { msgtype: 'text', text: { content: 'Audit message' } },
      parameters: [],
      enabled: true,
    })
  }

  async function withSuccessfulProvider<T>(run: () => Promise<T>) {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ errcode: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    try {
      return await run()
    } finally {
      globalThis.fetch = originalFetch
    }
  }

  test('records the session user as actor for the system send route', async ({
    client,
    assert,
  }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const user = await User.create({
      fullName: 'WeCom send audit admin',
      email: `wecom-send-audit-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([superAdminRole.id])
    const token = await User.accessTokens.create(user)
    const template = await createTemplate()

    const response = await withSuccessfulProvider(() =>
      client
        .post(`/api/v1/system/wecom-messages/${template.id}/send`)
        .bearerToken(token.value!.release())
        .json({ mentioned_list: ['member-1'] })
    )

    response.assertStatus(200)
    const audit = await AuditLog.query()
      .where('action', 'wecom_message.sent')
      .where('targetId', String(template.id))
      .firstOrFail()
    assert.equal(audit.actorUserId, user.id)
    assert.deepInclude(audit.metadata, {
      source: 'session',
      actorType: 'user',
      mentionedCount: 1,
    })
    assert.notProperty(audit.metadata ?? {}, 'apiKeyId')
  })

  test('records the API Key as actor for the integration send route', async ({
    client,
    assert,
  }) => {
    const rawKey = `id_${crypto.randomBytes(32).toString('base64url')}`
    const apiKey = await ApiKey.create({
      name: 'WeCom integration key',
      prefix: rawKey.slice(0, 12),
      keyHash: hashApiKey(rawKey),
    })
    const template = await createTemplate()

    const response = await withSuccessfulProvider(() =>
      client
        .post(`/api/v1/wecom-messages/${template.id}/send`)
        .bearerToken(rawKey)
        .json({ mentioned_mobile_list: ['13800000000'] })
    )

    response.assertStatus(200)
    const audit = await AuditLog.query()
      .where('action', 'wecom_message.sent')
      .where('targetId', String(template.id))
      .firstOrFail()
    assert.isNull(audit.actorUserId)
    assert.deepInclude(audit.metadata, {
      source: 'api_key',
      actorType: 'api_key',
      apiKeyId: apiKey.id,
      mentionedMobileCount: 1,
    })
  })
})
