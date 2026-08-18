import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createJiti } from 'jiti'

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const jiti = createJiti(import.meta.url, {
  alias: {
    '@': `${root}/src`,
  },
})

const { validatePasswordChange } = await jiti.import(`${root}/src/features/account/change-password-form.ts`)
const { streamAiChatMessage } = await jiti.import(`${root}/src/features/ai/api.ts`)
const { getAiChatSuggestions, pickRandomAiChatSuggestions } = await jiti.import(
  `${root}/src/features/ai/suggestions.ts`
)
const { formatAiChatMessagesAsMarkdown } = await jiti.import(`${root}/src/features/ai/markdown.ts`)
const { hasAiChatConversationContent } = await jiti.import(
  `${root}/src/features/ai/conversation-state.ts`
)

test('password change validation covers required fields, mismatch, and strength', () => {
  assert.equal(
    validatePasswordChange({ currentPassword: '', newPassword: '', confirmPassword: '' }),
    'fill_all'
  )
  assert.equal(
    validatePasswordChange({
      currentPassword: 'old-password',
      newPassword: 'NewPassword1!',
      confirmPassword: 'NewPassword2!',
    }),
    'password_mismatch'
  )
  assert.equal(
    validatePasswordChange({
      currentPassword: 'old-password',
      newPassword: 'weak',
      confirmPassword: 'weak',
    }),
    'password_weak'
  )
  assert.equal(
    validatePasswordChange({
      currentPassword: 'old-password',
      newPassword: 'Velvet-Quartz-Lantern-8412!',
      confirmPassword: 'Velvet-Quartz-Lantern-8412!',
    }),
    null
  )
})

test('AI stream rejects when the connection closes without a terminal event', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response('event: delta\ndata: {"content":"partial"}\n\n', { status: 200 })

  try {
    await assert.rejects(
      streamAiChatMessage(null, 1, 'Hello', () => undefined),
      /terminal event/
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('AI stream accepts a terminal done event', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(
      'event: done\ndata: {"conversation":{"id":1},"message":{"id":2},"confirmations":[]}\n\n',
      { status: 200 }
    )
  const events = []

  try {
    await streamAiChatMessage(null, 1, 'Hello', (event) => events.push(event))
    assert.equal(events[0].type, 'done')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('AI suggestions use effective permissions and prioritize the current page', () => {
  const translate = (key) => key

  const superAdminSuggestions = getAiChatSuggestions({
    permissions: ['*'],
    routeName: 'api-keys',
    translate,
  })

  assert.deepEqual(superAdminSuggestions.slice(0, 3), [
    'ai_chat.tasks.api_keys.list',
    'ai_chat.tasks.api_keys.create',
    'ai_chat.tasks.access.check',
  ])
  assert.ok(superAdminSuggestions.includes('ai_chat.tasks.audit_logs.recent'))

  assert.deepEqual(
    getAiChatSuggestions({
      permissions: ['api-keys:read'],
      routeName: 'schema-builder',
      translate,
    }),
    ['ai_chat.tasks.access.check', 'ai_chat.tasks.api_keys.list']
  )

  assert.deepEqual(
    pickRandomAiChatSuggestions(['a', 'b', 'c', 'd'], () => 0),
    ['b', 'c', 'd']
  )
  assert.equal(pickRandomAiChatSuggestions(['a', 'b', 'c', 'd', 'e'], () => 0).length, 3)
})

test('AI chat Markdown export preserves selected messages in conversation order', () => {
  assert.equal(
    formatAiChatMessagesAsMarkdown(
      [
        { role: 'user', content: 'Can you check this?' },
        { role: 'assistant', content: '## Findings\n\nEverything is working.' },
      ],
      { conversation: 'AI Assistant Conversation', user: 'User', assistant: 'AI Assistant' }
    ),
    '# AI Assistant Conversation\n\n## User\n\nCan you check this?\n\n## AI Assistant\n\n## Findings\n\nEverything is working.'
  )
})

test('empty AI conversations are reused when starting a new chat', () => {
  assert.equal(hasAiChatConversationContent([]), false)
  assert.equal(hasAiChatConversationContent([{ content: '  ' }]), false)
  assert.equal(hasAiChatConversationContent([{ content: 'Hello' }]), true)
})
