import {
  type AssistantMessage,
  createAssistantMessageEventStream,
  type Model,
  type ProviderStreams,
  type TranscriptContext,
} from '@earendil-works/pi-ai'
import { test } from '@japa/runner'

import {
  AiPrivacySession,
  createAiPrivacySession,
  withAiPrivacyBoundary,
} from '#ai/agent/pi/privacy_boundary'

test.group('AI privacy boundary', () => {
  test('sanitizes nested PII and credentials without changing local history', ({ assert }) => {
    const privacy = new AiPrivacySession('session-1', 'test-key')
    const original = {
      messages: [
        {
          role: 'toolResult',
          content: [{ type: 'text', text: 'Contact person@example.com' }],
          details: {
            fullName: 'Sensitive Person',
            email: 'person@example.com',
            apiToken: 'a-secret-value',
            log: 'Authorization: Bearer bearer-secret-value',
            environment: 'DB_PASS=config-pass PGPASSWORD=postgres-pass',
            'indexed person@example.com': 'email appears in an object key',
          },
        },
      ],
    }

    const request = privacy.prepareContext(original)
    const serialized = JSON.stringify(request)
    const systemPrompt = JSON.stringify(
      privacy.prepareContext({ systemPrompt: 'Follow person@example.com safely.', messages: [] })
    )

    assert.notInclude(serialized, 'Sensitive Person')
    assert.notInclude(serialized, 'person@example.com')
    assert.notInclude(serialized, 'a-secret-value')
    assert.notInclude(serialized, 'bearer-secret-value')
    assert.notInclude(serialized, 'config-pass')
    assert.notInclude(serialized, 'postgres-pass')
    assert.include(serialized, '{{PERSON_')
    assert.include(serialized, '{{EMAIL_')
    assert.include(serialized, '[REDACTED]')
    assert.equal(
      (privacy.restoreValue(request.messages[0].details) as Record<string, string>)[
        'indexed person@example.com'
      ],
      'email appears in an object key'
    )
    assert.notInclude(systemPrompt, 'person@example.com')
    assert.equal(original.messages[0].details.fullName, 'Sensitive Person')
    assert.equal(original.messages[0].details.email, 'person@example.com')
  })

  test('uses session-scoped stable placeholders and restores only known PII', ({ assert }) => {
    const first = new AiPrivacySession('session-1', 'test-key')
    const sameScope = new AiPrivacySession('session-1', 'test-key')
    const otherScope = new AiPrivacySession('session-2', 'test-key')
    const input = { messages: [{ role: 'user', content: [{ email: 'person@example.com' }] }] }
    const firstPlaceholder = JSON.stringify(first.prepareContext(input)).match(
      /\{\{EMAIL_[^}]+/
    )?.[0]
    const samePlaceholder = JSON.stringify(sameScope.prepareContext(input)).match(
      /\{\{EMAIL_[^}]+/
    )?.[0]
    const otherPlaceholder = JSON.stringify(otherScope.prepareContext(input)).match(
      /\{\{EMAIL_[^}]+/
    )?.[0]

    assert.isDefined(firstPlaceholder)
    assert.equal(firstPlaceholder, samePlaceholder)
    assert.notEqual(firstPlaceholder, otherPlaceholder)
    assert.equal(first.restoreText(`${firstPlaceholder}}}`), 'person@example.com')
    assert.equal(first.restoreText('{{EMAIL_0000000000000000}}'), '{{EMAIL_0000000000000000}}')
    assert.equal(first.restoreText('[REDACTED]'), '[REDACTED]')

    const history = new AiPrivacySession('session-1', 'test-key')
    history.prepareContext({ messages: [{ details: { fullName: 'Sensitive Person' } }] })
    const laterRequest = JSON.stringify(
      history.prepareContext({ messages: [{ content: 'Sensitive Person is an administrator.' }] })
    )
    assert.notInclude(laterRequest, 'Sensitive Person')
    assert.include(laterRequest, '{{PERSON_')
  })

  test('keeps mappings in process memory across runs for the same conversation', ({ assert }) => {
    const scope = `privacy-cache-test-${Date.now()}`
    const first = createAiPrivacySession(scope)
    const prepared = first.prepareContext({ messages: [{ email: 'person@example.com' }] })
    const placeholder = JSON.stringify(prepared).match(/\{\{EMAIL_[a-f0-9]{16}\}\}/)?.[0]
    assert.isDefined(placeholder)
    if (!placeholder) return

    const nextRun = createAiPrivacySession(scope)
    assert.equal(nextRun.restoreText(placeholder), 'person@example.com')
  })

  test('sanitizes provider input and restores streamed text and tool arguments', async ({
    assert,
  }) => {
    const privacy = new AiPrivacySession('session-1', 'test-key')
    const source = createAssistantMessageEventStream()
    let sentContext: unknown
    const streams = {
      streamSimple(_model: Model<'openai-completions'>, context: TranscriptContext) {
        sentContext = context
        return source
      },
    } as unknown as ProviderStreams
    const model = {
      api: 'openai-completions',
      provider: 'test-provider',
      id: 'test-model',
    } as Model<'openai-completions'>
    const context = {
      messages: [{ role: 'user', content: 'Contact person@example.com' }],
    }
    const wrapped = withAiPrivacyBoundary(streams, privacy).streamSimple(
      model,
      context as never,
      {} as never
    )
    const sent = JSON.stringify(sentContext)
    const placeholder = sent.match(/\{\{EMAIL_[a-f0-9]{16}\}\}/)?.[0]
    assert.isDefined(placeholder)
    if (!placeholder) return

    const partialText = `Email ${placeholder}`
    const callArguments = { email: placeholder }
    const assistantMessage = {
      role: 'assistant',
      content: [
        { type: 'text', text: partialText },
        { type: 'toolCall', id: 'call-1', name: 'lookup', arguments: callArguments },
      ],
      api: 'openai-completions',
      provider: 'test-provider',
      model: 'test-model',
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: 'stop',
      timestamp: Date.now(),
    } as AssistantMessage
    const [head, tail] = [
      partialText.slice(0, partialText.indexOf('{{')),
      partialText.slice(partialText.indexOf('{{')),
    ]

    source.push({
      type: 'text_delta',
      contentIndex: 0,
      delta: head,
      partial: { ...assistantMessage, content: [{ type: 'text', text: head }] },
    } as never)
    source.push({
      type: 'text_delta',
      contentIndex: 0,
      delta: tail,
      partial: assistantMessage,
    } as never)
    source.push({
      type: 'text_end',
      contentIndex: 0,
      content: partialText,
      partial: assistantMessage,
    } as never)
    source.push({
      type: 'toolcall_end',
      contentIndex: 1,
      toolCall: { id: 'call-1', name: 'lookup', arguments: callArguments },
      partial: assistantMessage,
    } as never)
    source.push({ type: 'done', message: assistantMessage } as never)
    source.end()

    const events = []
    for await (const event of wrapped) events.push(event)

    assert.notInclude(sent, 'person@example.com')
    assert.include(sent, placeholder)
    assert.equal(
      events
        .filter((event) => event.type === 'text_delta')
        .map((event) => (event.type === 'text_delta' ? event.delta : ''))
        .join(''),
      'Email person@example.com'
    )
    const done = events.find((event) => event.type === 'done')
    assert.isDefined(done)
    if (done?.type !== 'done') return
    assert.equal((done.message.content[0] as { text: string }).text, 'Email person@example.com')
    assert.deepEqual((done.message.content[1] as { arguments: unknown }).arguments, {
      email: 'person@example.com',
    })
  })
})
