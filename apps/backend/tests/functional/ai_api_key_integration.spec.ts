import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'

import { ensureAiAgentPermission } from '#ai/core/ai_agent_authorization'
import AiChatConversation from '#models/ai_chat_conversation'
import AiUsageEvent from '#models/ai_usage_event'
import ApiKey from '#models/api_key'
import Role from '#models/role'
import User from '#models/user'
import { generateInitialPassword } from '#security/user_credentials'
import { hashApiKey } from '#services/api_key_service'
import { getAiIntegrationUser } from '#services/channel_guest_principal'
import { permissionCatalog } from '#services/permission_catalog'

test.group('AI API Key integration', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  async function createApiKey(label: string) {
    const secret = `id_ai_${label}_${Date.now()}`
    const apiKey = await ApiKey.create({
      name: label,
      prefix: secret.slice(0, 12),
      keyHash: hashApiKey(secret),
    })
    return { apiKey, secret }
  }

  test('gives each global key full assistant access with isolated conversations', async ({
    client,
    assert,
  }) => {
    const firstKey = await createApiKey('first')
    const secondKey = await createApiKey('second')
    const principal = await getAiIntegrationUser()

    for (const permission of permissionCatalog) {
      await ensureAiAgentPermission(principal.id, permission.code)
    }

    const created = await client
      .post('/api/v1/integrations/ai-chat/conversations')
      .bearerToken(firstKey.secret)
      .json({ title: 'Partner conversation' })
    created.assertStatus(200)
    const conversationId = (created.body() as unknown as { data: { id: number } }).data.id
    const conversation = await AiChatConversation.findOrFail(conversationId)
    assert.equal(conversation.userId, principal.id)
    assert.equal(conversation.apiKeyId, firstKey.apiKey.id)

    const secondCreated = await client
      .post('/api/v1/integrations/ai-chat/conversations')
      .bearerToken(secondKey.secret)
      .json({ title: 'Another partner conversation' })
    secondCreated.assertStatus(200)
    const secondConversationId = (secondCreated.body() as unknown as { data: { id: number } }).data
      .id
    for (const [usageConversationId, totalTokens] of [
      [conversationId, 11],
      [secondConversationId, 22],
    ]) {
      await AiUsageEvent.create({
        userId: principal.id,
        conversationId: usageConversationId,
        agentRunId: `key-${usageConversationId}`,
        callSequence: 1,
        providerId: 'test-provider',
        modelId: 'test-model',
        inputTokens: totalTokens,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens,
        estimatedCostUsd: null,
        pricingSource: 'unavailable',
        pricingVersion: null,
        status: 'completed',
      })
    }

    const ownConversation = await client
      .get(`/api/v1/integrations/ai-chat/conversations/${conversationId}`)
      .bearerToken(firstKey.secret)
    ownConversation.assertStatus(200)

    const otherKeyConversation = await client
      .get(`/api/v1/integrations/ai-chat/conversations/${conversationId}`)
      .bearerToken(secondKey.secret)
    otherKeyConversation.assertStatus(404)

    const listedByOtherKey = await client
      .get('/api/v1/integrations/ai-chat/conversations')
      .bearerToken(secondKey.secret)
    listedByOtherKey.assertStatus(200)
    assert.deepEqual(
      (
        listedByOtherKey.body() as unknown as {
          data: { items: Array<{ id: number }> }
        }
      ).data.items.map(({ id }) => id),
      [secondConversationId]
    )

    const usage = await client
      .get('/api/v1/integrations/ai-chat/usage')
      .bearerToken(firstKey.secret)
    usage.assertStatus(200)
    assert.equal(
      (usage.body() as unknown as { data: { totalTokens: number } }).data.totalTokens,
      11
    )

    const otherUsage = await client
      .get('/api/v1/integrations/ai-chat/usage')
      .bearerToken(secondKey.secret)
    otherUsage.assertStatus(200)
    assert.equal((otherUsage.body().data as { totalTokens: number }).totalTokens, 22)
  })

  test('keeps the internal assistant principal disabled and outside user management', async ({
    client,
    assert,
  }) => {
    const principal = await getAiIntegrationUser()
    const superAdmin = await Role.findByOrFail('code', 'super-admin')
    const admin = await User.create({
      fullName: 'Internal Principal Guard',
      email: `ai-principal-guard-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await admin.related('roles').sync([superAdmin.id])
    const token = await User.accessTokens.create(admin)

    assert.isNotNull(principal.disabledAt)
    const response = await client
      .delete(`/api/v1/system/users/${principal.id}`)
      .bearerToken(token.value!.release())
    response.assertStatus(403)
    assert.isNotNull(await User.find(principal.id))
  })
})
