import { test } from '@japa/runner'
import { DateTime } from 'luxon'

import {
  createAiAgentRuntimeContext,
  serializeAiAgentRuntimeContext,
} from '#ai/core/ai_agent_runtime_context'

test.group('AI agent runtime context', () => {
  const now = DateTime.fromISO('2026-09-08T13:10:00Z').setZone('Asia/Shanghai') as DateTime<boolean>

  test('serializes the current time using the runtime timezone', ({ assert }) => {
    const context = createAiAgentRuntimeContext(now)

    assert.deepEqual(context.currentTime, {
      utc: '2026-09-08T13:10:00Z',
      local: '2026-09-08T21:10:00+08:00',
      timeZone: 'Asia/Shanghai',
      weekday: '星期二',
    })
    assert.isString(context.locale)
  })

  test('produces JSON instead of markup', ({ assert }) => {
    const serialized = serializeAiAgentRuntimeContext(now)

    assert.deepEqual(JSON.parse(serialized), createAiAgentRuntimeContext(now))
    assert.notInclude(serialized, '<')
    assert.notInclude(serialized, '>')
  })
})
