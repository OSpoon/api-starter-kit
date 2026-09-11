import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'

import AiChatConversation from '#models/ai_chat_conversation'
import AiUsageEvent from '#models/ai_usage_event'
import Permission from '#models/permission'
import Role from '#models/role'
import User from '#models/user'
import { generateInitialPassword } from '#security/user_credentials'

test.group('AI usage', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  async function createSuperAdmin() {
    const role = await Role.findByOrFail('code', 'super-admin')
    const user = await User.create({
      fullName: 'Usage Admin',
      email: `usage-admin-${Date.now()}-${Math.random()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([role.id])
    const token = await User.accessTokens.create(user)
    return { user, bearerToken: token.value!.release() }
  }

  test('returns only the current user usage and keeps model breakdowns', async ({
    client,
    assert,
  }) => {
    const first = await createSuperAdmin()
    const second = await createSuperAdmin()
    const firstConversation = await AiChatConversation.create({
      userId: first.user.id,
      title: 'First usage conversation',
    })
    const secondConversation = await AiChatConversation.create({
      userId: second.user.id,
      title: 'Second usage conversation',
    })

    await AiUsageEvent.create({
      userId: first.user.id,
      conversationId: firstConversation.id,
      agentRunId: `usage-run-${first.user.id}`,
      callSequence: 0,
      providerId: 'api-starter-openai',
      modelId: 'openai/gpt-4o-mini',
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 3,
      cacheWriteTokens: 2,
      totalTokens: 15,
      estimatedCostUsd: '0.000100000000',
      pricingSource: 'models.dev',
      pricingVersion: '2026-09-01',
      status: 'completed',
    })
    await AiUsageEvent.create({
      userId: second.user.id,
      conversationId: secondConversation.id,
      agentRunId: `usage-run-${second.user.id}`,
      callSequence: 0,
      providerId: 'api-starter-openai',
      modelId: 'private/deployment',
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 150,
      estimatedCostUsd: null,
      pricingSource: 'unavailable',
      pricingVersion: null,
      status: 'completed',
    })

    const response = await client.get('/api/v1/ai-chat/usage').bearerToken(first.bearerToken)

    response.assertStatus(200)
    const body = response.body().data as {
      inputTokens: number
      outputTokens: number
      cacheReadTokens: number
      cacheWriteTokens: number
      totalTokens: number
      modelCalls: number
      estimatedCostUsd: number
      models: Array<{
        modelId: string
        cacheReadTokens: number
        cacheWriteTokens: number
        totalTokens: number
      }>
    }
    assert.equal(body.inputTokens, 10)
    assert.equal(body.outputTokens, 5)
    assert.equal(body.cacheReadTokens, 3)
    assert.equal(body.cacheWriteTokens, 2)
    assert.equal(body.totalTokens, 15)
    assert.equal(body.modelCalls, 1)
    assert.equal(body.estimatedCostUsd, 0.0001)
    assert.lengthOf(body.models, 1)
    assert.equal(body.models[0].modelId, 'openai/gpt-4o-mini')
    assert.equal(body.models[0].cacheReadTokens, 3)
    assert.equal(body.models[0].cacheWriteTokens, 2)
    assert.equal(body.models[0].totalTokens, 15)
  })

  test('denies usage access without the usage permission', async ({ client }) => {
    const user = await User.create({
      fullName: 'Usage Reader Without Permission',
      email: `usage-denied-${Date.now()}-${Math.random()}@example.com`,
      password: generateInitialPassword(),
    })
    const token = await User.accessTokens.create(user)

    const response = await client.get('/api/v1/ai-chat/usage').bearerToken(token.value!.release())

    response.assertStatus(403)
  })

  test('keeps a usage event after its conversation is deleted', async ({ assert }) => {
    const { user } = await createSuperAdmin()
    const conversation = await AiChatConversation.create({
      userId: user.id,
      title: 'Retained usage conversation',
    })
    const event = await AiUsageEvent.create({
      userId: user.id,
      conversationId: conversation.id,
      agentRunId: `retained-usage-run-${user.id}`,
      callSequence: 0,
      providerId: 'api-starter-openai',
      modelId: 'private/deployment',
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 15,
      estimatedCostUsd: null,
      pricingSource: 'unavailable',
      pricingVersion: null,
      status: 'completed',
    })

    await conversation.delete()

    const retained = await AiUsageEvent.findOrFail(event.id)
    assert.isNull(retained.conversationId)
    assert.equal(retained.userId, user.id)
  })

  test('seeds the usage permission for the super-admin role', async ({ assert }) => {
    const permission = await Permission.findByOrFail('code', 'ai-usage:read')
    const role = await Role.query()
      .where('code', 'super-admin')
      .preload('permissions')
      .firstOrFail()

    assert.isTrue(role.permissions.some((item) => item.id === permission.id))
  })
})
