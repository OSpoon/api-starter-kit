import { test } from '@japa/runner'

import { createVisitorConversationKey } from '#services/channel_conversation_service'

test.group('channel visitor conversation keys', () => {
  test('isolates users and preserves stable keys for the same group conversation', ({ assert }) => {
    const first = createVisitorConversationKey({
      externalConversationKey: 'group-1',
      externalUserId: 'user-1',
    })
    const same = createVisitorConversationKey({
      externalConversationKey: 'group-1',
      externalUserId: 'user-1',
    })
    const otherUser = createVisitorConversationKey({
      externalConversationKey: 'group-1',
      externalUserId: 'user-2',
    })
    const otherGroup = createVisitorConversationKey({
      externalConversationKey: 'group-2',
      externalUserId: 'user-1',
    })

    assert.equal(first, same)
    assert.notEqual(first, otherUser)
    assert.notEqual(first, otherGroup)
    assert.match(first, /^visitor:[a-f0-9]{64}$/)
  })
})
