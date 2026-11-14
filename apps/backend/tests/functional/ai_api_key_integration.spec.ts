import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'

import AiChatConversation from '#models/ai_chat_conversation'
import AiUsageEvent from '#models/ai_usage_event'
import ApiKey from '#models/api_key'
import Role from '#models/role'
import User from '#models/user'
import { generateInitialPassword } from '#security/user_credentials'
import { hashApiKey } from '#services/api_key_service'
import { getAiIntegrationUser } from '#services/channel_guest_principal'

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

  test('keeps streamed confirmation limited to user-authenticated routes', async ({ client }) => {
    const response = await client.post(
      '/api/v1/integrations/ai-chat/conversations/1/confirmations/1/confirm/stream'
    )
    response.assertStatus(404)
  })

  test('uses one API key for integration and embed routes while isolating conversations', async ({
    client,
    assert,
  }) => {
    const secret = `id_embed_${Date.now()}`
    const apiKey = await ApiKey.create({
      name: 'Assistant API key',
      prefix: secret.slice(0, 12),
      keyHash: hashApiKey(secret),
    })
    const sessionA = '12f89f6e-5351-4fb3-8374-7b971d1e5975'
    const sessionB = '7d68ccf0-45c3-4f70-a563-884e9ae88d34'

    const first = await client
      .post('/api/v1/embed/ai-chat/conversations')
      .header('x-api-key', secret)
      .header('x-embed-session', sessionA)
      .json({})
    first.assertStatus(200)
    const firstId = (first.body() as unknown as { data: { id: number } }).data.id
    const firstConversation = await AiChatConversation.findOrFail(firstId)
    assert.equal(firstConversation.apiKeyId, apiKey.id)
    assert.equal(firstConversation.embedSessionId, sessionA)

    const second = await client
      .post('/api/v1/embed/ai-chat/conversations')
      .header('x-api-key', secret)
      .header('x-embed-session', sessionB)
      .json({})
    second.assertStatus(200)
    const secondId = (second.body() as unknown as { data: { id: number } }).data.id

    const listed = await client
      .get('/api/v1/embed/ai-chat/conversations')
      .header('x-api-key', secret)
      .header('x-embed-session', sessionA)
    listed.assertStatus(200)
    assert.deepEqual(
      (listed.body() as { data: { items: Array<{ id: number }> } }).data.items.map(({ id }) => id),
      [firstId]
    )

    const crossSession = await client
      .get(`/api/v1/embed/ai-chat/conversations/${firstId}`)
      .header('x-api-key', secret)
      .header('x-embed-session', sessionB)
    crossSession.assertStatus(404)

    const integrationRoute = await client
      .post('/api/v1/integrations/ai-chat/conversations')
      .bearerToken(secret)
      .json({})
    integrationRoute.assertStatus(200)
    const integrationId = (integrationRoute.body() as unknown as { data: { id: number } }).data.id
    const integrationConversation = await AiChatConversation.findOrFail(integrationId)
    assert.isNull(integrationConversation.embedSessionId)

    const integrationList = await client
      .get('/api/v1/integrations/ai-chat/conversations')
      .bearerToken(secret)
    integrationList.assertStatus(200)
    assert.deepEqual(
      (integrationList.body() as { data: { items: Array<{ id: number }> } }).data.items.map(
        ({ id }) => id
      ),
      [integrationId]
    )

    const invalidSession = await client
      .post('/api/v1/embed/ai-chat/conversations')
      .header('x-api-key', secret)
      .header('x-embed-session', 'invalid')
      .json({})
    invalidSession.assertStatus(422)
    assert.isNotNull(await AiChatConversation.find(secondId))

    const unauthenticated = await client
      .post('/api/v1/embed/ai-chat/conversations')
      .header('x-embed-session', sessionA)
      .json({})
    unauthenticated.assertStatus(401)
  })

  test('gives each global key full assistant access with isolated conversations', async ({
    client,
    assert,
  }) => {
    const firstKey = await createApiKey('first')
    const secondKey = await createApiKey('second')
    const principal = await getAiIntegrationUser()

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
