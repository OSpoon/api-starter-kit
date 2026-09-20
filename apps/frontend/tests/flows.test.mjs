import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createJiti } from 'jiti'

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const jiti = createJiti(import.meta.url, {
  alias: {
    '@': `${root}/src`,
  },
})

const { validatePasswordChange } = await jiti.import(
  `${root}/src/features/account/change-password-form.ts`
)
const { streamAiChatMessage } = await jiti.import(`${root}/src/features/ai/api.ts`)
const { formatAiChatMessagesAsMarkdown } = await jiti.import(`${root}/src/features/ai/markdown.ts`)
const { hasAiChatConversationContent } = await jiti.import(
  `${root}/src/features/ai/conversation-state.ts`
)
const { buildListQuery } = await jiti.import(`${root}/src/lib/list-query.ts`)
const { hasUnsavedLlmConfiguration } = await jiti.import(
  `${root}/src/features/llm-config/form-state.ts`
)
const { workbenchRoutes } = await jiti.import(`${root}/src/router/modules/workbench.ts`)
const { developmentWorkbenchRoutes } = await jiti.import(
  `${root}/src/router/modules/workbench-examples.ts`
)
const { findFirstAccessibleRoute } = await jiti.import(`${root}/src/router/route-access.ts`)

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

test('remote list query trims search and omits an empty search parameter', () => {
  assert.deepEqual(
    Object.fromEntries(new URLSearchParams(buildListQuery(2, '  gateway ', { status: 'active' }))),
    { page: '2', limit: '20', status: 'active', search: 'gateway' }
  )
  assert.deepEqual(Object.fromEntries(new URLSearchParams(buildListQuery(1, '   '))), {
    page: '1',
    limit: '20',
  })
})

test('LLM connection test draft comparison detects unsaved fields and secrets', () => {
  const saved = {
    chat: { baseUrl: 'https://chat.example', model: 'chat-model', apiKeyConfigured: true },
    asr: { baseUrl: null, model: 'asr-model', apiKeyConfigured: false },
    embedding: {
      baseUrl: 'https://embed.example',
      model: 'embedding-model',
      dimensions: 1024,
      apiKeyConfigured: true,
    },
    requestTimeoutMs: 180000,
    updatedAt: '2026-09-20T00:00:00.000Z',
  }
  const unchanged = {
    chatApiKey: '',
    chatBaseUrl: 'https://chat.example',
    chatModel: 'chat-model',
    asrApiKey: '',
    asrBaseUrl: '',
    asrModel: 'asr-model',
    embeddingApiKey: '',
    embeddingBaseUrl: 'https://embed.example',
    embeddingModel: 'embedding-model',
    embeddingDimensions: 1024,
    requestTimeoutMs: 180000,
  }

  assert.equal(hasUnsavedLlmConfiguration(unchanged, saved), false)
  assert.equal(hasUnsavedLlmConfiguration({ ...unchanged, chatModel: 'draft-model' }, saved), true)
  assert.equal(hasUnsavedLlmConfiguration({ ...unchanged, chatApiKey: 'new-secret' }, saved), true)
  assert.equal(hasUnsavedLlmConfiguration(unchanged, null), true)
})

test('workbench starter examples are only added to development routes', () => {
  const productionNames = workbenchRoutes[0].children.map((route) => route.name)
  const developmentNames = developmentWorkbenchRoutes.map((route) => route.name)

  for (const name of [
    'workflow-template',
    'analytics-template',
    'wizard-template',
    'operations-template',
    'schema-builder',
    'sql-editor',
    'sql-workspace',
  ]) {
    assert.equal(productionNames.includes(name), false, `${name} should not ship as a route`)
    assert.equal(developmentNames.includes(name), true, `${name} should remain available in dev`)
  }
})

test('permission-aware landing picks the first accessible module', () => {
  const routes = [
    { name: 'dashboard', meta: { permission: 'dashboard:view' } },
    { name: 'api-keys', meta: { permission: 'api-keys:read' } },
  ]

  assert.equal(findFirstAccessibleRoute(routes, ['api-keys:read'])?.name, 'api-keys')
  assert.equal(findFirstAccessibleRoute(routes, ['profile:read']), undefined)
})
