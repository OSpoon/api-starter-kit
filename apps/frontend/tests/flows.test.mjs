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
const { streamAiAgentActionConfirmation, streamAiChatMessage } = await jiti.import(
  `${root}/src/features/ai/api.ts`
)
const { useAiChatStream } = await jiti.import(
  `${root}/src/features/ai/composables/useAiChatStream.ts`
)
const { ref } = await jiti.import('vue')
const { formatAiChatMessagesAsMarkdown } = await jiti.import(`${root}/src/features/ai/markdown.ts`)
const { hasAiChatConversationContent } = await jiti.import(
  `${root}/src/features/ai/conversation-state.ts`
)
const { didReachMessageScrollerStart } = await jiti.import(
  `${root}/src/components/ui/message-scroller/useMessageScroller.ts`
)
const { buildListQuery } = await jiti.import(`${root}/src/lib/list-query.ts`)
const { buildLlmConfigurationUpdate, hasUnsavedLlmConfiguration } = await jiti.import(
  `${root}/src/features/agent-config/form-state.ts`
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

test('AI stream delivers MCP discovery and safe tool details', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(
      'event: agent_phase\ndata: {"name":"mcp_discovery","state":"running","callId":"mcp-discovery-1","startedAt":1000,"serverName":"Directory"}\n\n' +
        'event: agent_phase\ndata: {"name":"mcp_discovery","state":"done","callId":"mcp-discovery-1","startedAt":1000,"durationMs":350,"serverName":"Directory","toolCount":2,"tools":[{"name":"list_log_services","mode":"read"},{"name":"search_logs"}]}\n\n' +
        'event: agent_phase\ndata: {"name":"model_response","state":"running","callId":"model-response-1","startedAt":1050}\n\n' +
        'event: agent_phase\ndata: {"name":"model_response","state":"done","callId":"model-response-1","startedAt":1050,"durationMs":8400}\n\n' +
        'event: agent_status\ndata: {"name":"mcp_read_1_lookup_12345678","state":"running","callId":"mcp-call-1","startedAt":1100,"displayName":"Directory: lookup","detail":{"parameterSummary":[{"name":"query","type":"string"}]}}\n\n' +
        'event: agent_status\ndata: {"name":"mcp_read_1_lookup_12345678","state":"done","callId":"mcp-call-1","displayName":"Directory: lookup","detail":{"resultSummary":{"contentTypes":["text"],"textCharacters":18}}}\n\n' +
        'event: done\ndata: {"conversation":{"id":1},"message":{"id":2},"confirmations":[]}\n\n',
      { status: 200 }
    )
  const events = []

  try {
    await streamAiChatMessage(null, 1, 'Find a user', (event) => events.push(event))
    assert.deepEqual(
      events.map(({ type }) => type),
      [
        'agent_phase',
        'agent_phase',
        'agent_phase',
        'agent_phase',
        'agent_status',
        'agent_status',
        'done',
      ]
    )
    assert.equal(events[0].serverName, 'Directory')
    assert.equal(events[1].toolCount, 2)
    assert.deepEqual(events[1].tools, [
      { name: 'list_log_services', mode: 'read' },
      { name: 'search_logs' },
    ])
    assert.equal(events[3].durationMs, 8400)
    assert.equal(events[4].displayName, 'Directory: lookup')
    assert.deepEqual(events[4].detail.parameterSummary, [{ name: 'query', type: 'string' }])
    assert.equal(events[5].detail.resultSummary.textCharacters, 18)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('confirmation stream delivers status and assistant text before completion', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.method, 'POST')
    assert.equal(new Headers(options.headers).get('Accept'), 'text/event-stream')
    return new Response(
      'event: agent_status\ndata: {"name":"confirmation_execution","state":"running","callId":"tool-call-2"}\n\n' +
        'event: agent_status\ndata: {"name":"confirmation_execution","state":"done","callId":"tool-call-2","detail":{"toolName":"search_logs"}}\n\n' +
        'event: delta\ndata: {"content":"操作完成"}\n\n' +
        'event: done\ndata: {"conversation":{"id":1},"message":{"id":2},"confirmations":[]}\n\n',
      { status: 200 }
    )
  }
  const events = []

  try {
    await streamAiAgentActionConfirmation(null, 1, 2, (event) => events.push(event))
    assert.deepEqual(
      events.map(({ type }) => type),
      ['agent_status', 'agent_status', 'delta', 'done']
    )
    assert.equal(events[0].callId, 'tool-call-2')
    assert.equal(events[1].callId, events[0].callId)
    assert.equal(events[1].detail.toolName, 'search_logs')
    assert.equal(events[2].content, '操作完成')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('confirmation continuation keeps one assistant message and presents the next approval', async () => {
  const originalFetch = globalThis.fetch
  const now = '2026-10-26T00:00:00.000Z'
  const presentation = {
    title: 'Approve log query',
    summary: 'Read the latest backend log',
    targetLabel: 'backend',
    changes: [],
    impactLabel: 'Read only',
    approveLabel: 'Approve',
    cancelLabel: 'Cancel',
  }
  const previousConfirmation = {
    id: 1,
    messageId: 20,
    action: 'call_mcp_tool',
    status: 'confirmed',
    impact: 'standard',
    targetType: 'mcp_tool',
    targetId: 'logs:list_log_services',
    targetSummary: { serverName: 'logs', toolName: 'list_log_services' },
    changeSummary: [],
    expiresAt: null,
    presentation,
  }
  const nextConfirmation = {
    id: 2,
    messageId: 20,
    action: 'call_mcp_tool',
    status: 'pending',
    impact: 'standard',
    targetType: 'mcp_tool',
    targetId: 'logs:get_latest_log',
    targetSummary: { serverName: 'logs', toolName: 'get_latest_log' },
    changeSummary: [],
    expiresAt: '2026-10-26T00:10:00.000Z',
    presentation,
  }
  const assistantMessage = {
    id: 20,
    conversationId: 1,
    role: 'assistant',
    content: '我来查询最新日志。',
    citations: [],
    createdAt: now,
    updatedAt: now,
    timeline: [],
  }
  const conversation = {
    id: 1,
    title: '日志查询',
    createdAt: now,
    updatedAt: now,
    messages: [assistantMessage],
    confirmations: [previousConfirmation],
  }
  const state = {
    loading: ref(false),
    conversation: ref(conversation),
    conversations: ref([]),
    conversationPage: ref(1),
    conversationLastPage: ref(1),
    loadingConversations: ref(false),
    loadingOlderMessages: ref(false),
    streamingMessages: ref([]),
    streamingMessageId: ref(null),
    abortController: ref(null),
    confirmations: ref([previousConfirmation]),
    pendingConfirmation: ref(previousConfirmation),
    approvalDismissed: ref(false),
    runMeta: ref(null),
  }
  const presented = []
  const visibleMessageIdsAtApproval = []

  globalThis.fetch = async (url) => {
    if (String(url).includes('/confirm/stream')) {
      return new Response(
        'event: assistant_segment_start\ndata: {}\n\n' +
          `event: agent_confirmation\ndata: ${JSON.stringify({ ...nextConfirmation, messageId: undefined })}\n\n` +
          'event: delta\ndata: {"content":"等待第二次确认。"}\n\n' +
          `event: done\ndata: ${JSON.stringify({
            conversation: { id: 1, title: '日志查询', createdAt: now, updatedAt: now },
            message: assistantMessage,
            confirmations: [nextConfirmation],
          })}\n\n`,
        { status: 200 }
      )
    }

    return Response.json({ data: { ...conversation, confirmations: [nextConfirmation] } })
  }

  try {
    const chat = useAiChatStream(
      () => null,
      (key) => key,
      ref({ route: '/', title: 'AI Assistant' }),
      state,
      async () => conversation,
      async () => undefined,
      (confirmations) => {
        const latestConfirmation = confirmations.at(-1) ?? null
        presented.push(latestConfirmation)
        state.pendingConfirmation.value = latestConfirmation
        visibleMessageIdsAtApproval.push(state.streamingMessages.value.map((item) => item.id))
      }
    )

    assert.equal(await chat.confirmAction(1, 1), true)
    assert.deepEqual(visibleMessageIdsAtApproval[0], [20])
    assert.equal(presented[0].id, 2)
    assert.equal(presented[0].messageId, 20)
    assert.equal(state.pendingConfirmation.value.id, 2)
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

test('message scroller detects reaching the top edge once per crossing', () => {
  assert.equal(didReachMessageScrollerStart(true, false), false)
  assert.equal(didReachMessageScrollerStart(false, true), true)
  assert.equal(didReachMessageScrollerStart(false, false), false)
  assert.equal(didReachMessageScrollerStart(true, true), false)
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
    chat: {
      baseUrl: 'https://chat.example',
      model: 'chat-model',
      contextWindow: 128000,
      maxTokens: 16384,
      apiKeyConfigured: true,
    },
    asr: { baseUrl: null, model: 'asr-model', apiKeyConfigured: false },
    embedding: {
      baseUrl: 'https://embed.example',
      model: 'embedding-model',
      dimensions: 1024,
      apiKeyConfigured: true,
    },
    updatedAt: '2026-09-20T00:00:00.000Z',
  }
  const unchanged = {
    chatApiKey: '',
    chatBaseUrl: 'https://chat.example',
    chatModel: 'chat-model',
    chatContextWindow: 128000,
    chatMaxTokens: 16384,
    asrApiKey: '',
    asrBaseUrl: '',
    asrModel: 'asr-model',
    embeddingApiKey: '',
    embeddingBaseUrl: 'https://embed.example',
    embeddingModel: 'embedding-model',
  }

  assert.equal(hasUnsavedLlmConfiguration(unchanged, saved), false)
  assert.equal(hasUnsavedLlmConfiguration({ ...unchanged, chatModel: 'draft-model' }, saved), true)
  assert.equal(hasUnsavedLlmConfiguration({ ...unchanged, chatApiKey: 'new-secret' }, saved), true)
  assert.equal(
    hasUnsavedLlmConfiguration({ ...unchanged, chatModel: 'draft-model' }, saved, 'asr'),
    false
  )
  assert.equal(
    hasUnsavedLlmConfiguration({ ...unchanged, chatModel: 'draft-model' }, saved, 'chat'),
    true
  )
  assert.equal(hasUnsavedLlmConfiguration(unchanged, null), true)
})

test('saving one LLM model keeps the other saved models unchanged', () => {
  const saved = {
    chat: {
      baseUrl: 'https://chat.example',
      model: 'chat-model',
      contextWindow: 128000,
      maxTokens: 16384,
      apiKeyConfigured: true,
    },
    asr: { baseUrl: null, model: 'asr-model', apiKeyConfigured: false },
    embedding: {
      baseUrl: 'https://embed.example',
      model: 'embedding-model',
      dimensions: 1024,
      apiKeyConfigured: true,
    },
    updatedAt: '2026-09-20T00:00:00.000Z',
  }
  const draft = {
    chatApiKey: '',
    chatBaseUrl: 'https://chat.example',
    chatModel: 'chat-model',
    chatContextWindow: 128000,
    chatMaxTokens: 16384,
    asrApiKey: 'new-asr-key',
    asrBaseUrl: 'https://asr.example',
    asrModel: 'new-asr-model',
    embeddingApiKey: '',
    embeddingBaseUrl: 'https://embed.example',
    embeddingModel: 'embedding-model',
  }

  assert.deepEqual(buildLlmConfigurationUpdate(draft, saved, 'asr'), {
    chatApiKey: undefined,
    chatBaseUrl: 'https://chat.example',
    chatModel: 'chat-model',
    chatContextWindow: 128000,
    chatMaxTokens: 16384,
    asrApiKey: 'new-asr-key',
    asrBaseUrl: 'https://asr.example',
    asrModel: 'new-asr-model',
    embeddingApiKey: undefined,
    embeddingBaseUrl: 'https://embed.example',
    embeddingModel: 'embedding-model',
    embeddingDimensions: 1024,
  })
})

test('workbench template pages are removed while SQL tools stay development-only', () => {
  const productionNames = workbenchRoutes[0].children.map((route) => route.name)
  const developmentNames = developmentWorkbenchRoutes.map((route) => route.name)

  for (const name of [
    'workflow-template',
    'analytics-template',
    'wizard-template',
    'operations-template',
  ]) {
    assert.equal(productionNames.includes(name), false, `${name} should not ship as a route`)
    assert.equal(developmentNames.includes(name), false, `${name} should be removed`)
  }

  for (const name of ['schema-builder', 'sql-editor', 'sql-workspace']) {
    assert.equal(productionNames.includes(name), false, `${name} should not ship as a route`)
    assert.equal(developmentNames.includes(name), true, `${name} should remain available in dev`)
  }
})

test('IM configuration is a section of Agent configuration without a separate menu entry', () => {
  const routes = workbenchRoutes[0].children
  const agentConfig = routes.find((route) => route.name === 'agent-config')
  const imConfig = routes.find((route) => route.name === 'im-config')

  assert.ok(agentConfig)
  assert.deepEqual(imConfig.redirect, { name: 'agent-config', query: { module: 'im' } })
  assert.equal(imConfig.meta?.nav, undefined)
})

test('permission-aware landing picks the first accessible module', () => {
  const routes = [
    { name: 'dashboard', meta: { permission: 'dashboard:view' } },
    { name: 'api-keys', meta: { permission: 'api-keys:read' } },
  ]

  assert.equal(findFirstAccessibleRoute(routes, ['api-keys:read'])?.name, 'api-keys')
  assert.equal(findFirstAccessibleRoute(routes, ['profile:read']), undefined)
})

// A help utility must not become the default landing for existing dashboard readers.
test('Todo board access is independent and preserves the workbench landing', () => {
  const routes = workbenchRoutes[0].children.filter((route) => route.meta?.permission)
  const board = routes.find((route) => route.name === 'todo-board')
  assert.equal(board.meta.permission, 'todo-board:read')
  assert.equal(findFirstAccessibleRoute(routes, ['dashboard:view'])?.name, 'dashboard')
  assert.equal(findFirstAccessibleRoute([board], ['dashboard:view']), undefined)
  assert.equal(findFirstAccessibleRoute([board], ['todo-board:read'])?.name, 'todo-board')
})
