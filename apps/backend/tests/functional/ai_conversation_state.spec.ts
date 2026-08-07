import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'

import AiAgentPendingQuery from '#models/ai_agent_pending_query'
import AiChatConversation from '#models/ai_chat_conversation'
import Role from '#models/role'
import User from '#models/user'
import { resetAiConversationState } from '#services/ai_conversation_state'
import { generateInitialPassword } from '#services/user_credentials'

async function createAdminConversation() {
  const role = await Role.findByOrFail('code', 'super-admin')
  const user = await User.create({
    fullName: 'Reset Administrator',
    email: `reset-admin-${Date.now()}@example.com`,
    password: generateInitialPassword(),
  })
  await user.related('roles').sync([role.id])
  const conversation = await AiChatConversation.create({ userId: user.id, title: 'Reset test' })
  return { user, conversation }
}

test.group('AI conversation state reset', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('cancels collecting_parameters pending queries so they cannot poison regenerated turns', async ({
    assert,
  }) => {
    const { user, conversation } = await createAdminConversation()
    await AiAgentPendingQuery.create({
      conversationId: conversation.id,
      requestedByUserId: user.id,
      templateCode: 'managed_user_profile',
      templateVersion: 1,
      params: {},
      status: 'collecting_parameters',
      expiresAt: DateTime.now().plus({ minutes: 15 }),
    })

    await resetAiConversationState({ conversationId: conversation.id, userId: user.id })

    const pending = await AiAgentPendingQuery.query()
      .where('conversation_id', conversation.id)
      .first()
    assert.equal(pending?.status, 'cancelled')
  })

  test('leaves non-active pending queries untouched', async ({ assert }) => {
    const { user, conversation } = await createAdminConversation()
    await AiAgentPendingQuery.create({
      conversationId: conversation.id,
      requestedByUserId: user.id,
      templateCode: 'managed_users',
      templateVersion: 1,
      params: { limit: 10 },
      status: 'executed',
      expiresAt: DateTime.now().minus({ minutes: 1 }),
      completedAt: DateTime.now(),
    })

    await resetAiConversationState({ conversationId: conversation.id, userId: user.id })

    const pending = await AiAgentPendingQuery.query()
      .where('conversation_id', conversation.id)
      .first()
    assert.equal(pending?.status, 'executed')
  })

  test('does not cancel pending queries owned by another conversation', async ({ assert }) => {
    const { user, conversation } = await createAdminConversation()
    const other = await createAdminConversation()
    await AiAgentPendingQuery.create({
      conversationId: other.conversation.id,
      requestedByUserId: other.user.id,
      templateCode: 'managed_user_profile',
      templateVersion: 1,
      params: {},
      status: 'collecting_parameters',
      expiresAt: DateTime.now().plus({ minutes: 15 }),
    })

    await resetAiConversationState({ conversationId: conversation.id, userId: user.id })

    const otherPending = await AiAgentPendingQuery.query()
      .where('conversation_id', other.conversation.id)
      .first()
    assert.equal(otherPending?.status, 'collecting_parameters')
  })
})
