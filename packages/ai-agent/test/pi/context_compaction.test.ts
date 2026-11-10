import assert from 'node:assert/strict'

import type { AgentMessage } from '@earendil-works/pi-agent-core'
import { estimateContextTokens, estimateMessageTokens } from '@earendil-works/pi-ai/utils/estimate'
import { describe, it } from 'vitest'

import {
  buildAiAgentSummaryBatch,
  trimPiContextToTokenBudget,
} from '../../src/pi/context_compaction.js'
import { createRequestContextSectionPreparer } from '../../src/pi/engine.js'
import type { PiAgentMessage } from '../../src/pi/types.js'

describe('Pi context preparation', () => {
  it('refreshes runtime context without changing the conversation transcript', async () => {
    let refreshCount = 0
    const prepareRequest = createRequestContextSectionPreparer({
      initialValue: 'initial context',
      refresh: async () => `refreshed context ${++refreshCount}`,
    })
    const context: { messages: PiAgentMessage[] } = {
      messages: [
        {
          role: 'system',
          content: 'System policy',
          sections: { runtime_context: 'stale context' },
          timestamp: 0,
        },
        { role: 'user', content: 'Current request', timestamp: 1 },
        {
          role: 'toolResult',
          toolCallId: 'call-1',
          toolName: 'read_profile',
          content: [{ type: 'text', text: 'Tool result' }],
          details: {},
          isError: false,
          timestamp: 2,
        },
      ],
    }
    const request = (requestContext: typeof context) => ({
      context: requestContext,
      model: {} as never,
      thinkingLevel: 'off' as const,
    })
    const getRuntimeContext = (value: typeof context | undefined) => {
      const systemMessage = value?.messages.find((message) => message.role === 'system')
      return systemMessage?.role === 'system' ? systemMessage.sections?.runtime_context : undefined
    }

    const first = await prepareRequest(request(context))
    assert.equal(refreshCount, 0)
    assert.equal(getRuntimeContext(first?.context), 'initial context')
    assert.deepEqual(first?.context?.messages.slice(1), context.messages.slice(1))

    const second = await prepareRequest(request(first?.context ?? context))
    assert.equal(refreshCount, 1)
    assert.equal(getRuntimeContext(second?.context), 'refreshed context 1')
    assert.deepEqual(second?.context?.messages.slice(1), context.messages.slice(1))

    const third = await prepareRequest(request(second?.context ?? context))
    assert.equal(refreshCount, 2)
    assert.equal(getRuntimeContext(third?.context), 'refreshed context 2')
    assert.equal(getRuntimeContext(context), 'stale context')
  })

  it('keeps complete persistence history separate from bounded model context', () => {
    const messages = Array.from({ length: 10 }, (_, index) => ({
      role: 'user' as const,
      content: `message-${index}`,
      timestamp: index,
    }))

    const transformed = trimPiContextToTokenBudget(messages, 12)

    assert.ok(transformed.length < messages.length)
    assert.equal((transformed.at(-1) as { content: string }).content, 'message-9')
    assert.equal(messages.length, 10)
  })

  it('bounds summary input and advances only through included source messages', () => {
    const messages: PiAgentMessage[] = [
      { role: 'user', content: 'history '.repeat(1000), timestamp: 0, sourceMessageId: 12 },
      { role: 'user', content: 'later history', timestamp: 0, sourceMessageId: 13 },
    ]

    const batch = buildAiAgentSummaryBatch(messages, 'prior summary', 120)

    assert.ok(batch)
    assert.ok(estimateMessageTokens({ role: 'user', content: batch.content, timestamp: 0 }) <= 120)
    assert.equal(batch.coveredThroughMessageId, 12)
    assert.ok(!batch.content.includes('later history'))
  })

  it('keeps an oversized latest user message within budget without changing history', () => {
    const original = {
      role: 'user' as const,
      content: 'long prompt '.repeat(2000),
      timestamp: 0,
    }

    const transformed = trimPiContextToTokenBudget([original], 40)

    assert.ok(estimateContextTokens(transformed as AgentMessage[]).tokens <= 40)
    assert.ok((transformed[0] as { content: string }).content.length < original.content.length)
    assert.equal(original.content.length, 'long prompt '.repeat(2000).length)
  })
})
