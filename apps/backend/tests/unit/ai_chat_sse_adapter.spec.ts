import type { HttpContext } from '@adonisjs/core/http'
import { test } from '@japa/runner'

import type { createAiAgentStream } from '#services/ai_agent_service'
import { streamAiAgentToolStatuses, writeAiChatSse } from '#services/ai_chat_sse_adapter'

type FakeToolCall = {
  name: string
  callId: string
  input: unknown
  status: Promise<'finished' | 'error'>
  output: Promise<unknown>
}

function createFakeRun(toolCalls: FakeToolCall[]) {
  async function* generate() {
    for (const toolCall of toolCalls) {
      yield toolCall
    }
  }
  return {
    agentRunId: 'agent-run-1',
    stream: { toolCalls: generate() },
  } as unknown as Awaited<ReturnType<typeof createAiAgentStream>>
}

function createFakeResponse() {
  const writes: string[] = []
  const nodeResponse = {
    writableEnded: false,
    destroyed: false,
    write: (chunk: string) => writes.push(chunk),
  }
  return {
    writes,
    response: {
      response: nodeResponse,
    } as unknown as HttpContext['response'],
    endResponse: () => {
      nodeResponse.writableEnded = true
    },
  }
}

function parseSse(writes: string[]) {
  return writes
    .join('')
    .split('\n\n')
    .filter((block) => block.trim() !== '')
    .filter((block) => !block.startsWith(':'))
    .map((block) => {
      const lines = block.split('\n')
      const eventLine = lines.find((line) => line.startsWith('event: '))
      const dataLine = lines.find((line) => line.startsWith('data: '))
      return {
        event: eventLine?.slice('event: '.length),
        data: dataLine ? JSON.parse(dataLine.slice('data: '.length)) : null,
      }
    })
}

test.group('AI chat SSE adapter', () => {
  test('emits running then done agent_status with callId and durationMs', async ({ assert }) => {
    const { writes, response } = createFakeResponse()
    const run = createFakeRun([
      {
        name: 'run_registered_query',
        callId: 'call-1',
        input: { templateCode: 'team_member_count' },
        status: Promise.resolve('finished'),
        output: Promise.resolve({
          kind: 'query_result',
          rows: [{}, {}, {}],
        }),
      },
    ])
    const completedNames: string[] = []

    const result = await streamAiAgentToolStatuses(
      run,
      response,
      new AbortController().signal,
      (name, output) => {
        completedNames.push(name)
        void output
      }
    )
    const frames = parseSse(writes)

    assert.deepEqual(
      frames.map((frame) => frame.event),
      ['agent_plan', 'agent_status', 'agent_status', 'agent_plan']
    )

    const running = frames[1].data as Record<string, unknown>
    assert.equal(running.name, 'run_registered_query')
    assert.equal(running.callId, 'call-1')
    assert.equal(running.state, 'running')
    assert.equal(running.phase, 'identifying_target')
    assert.equal((running.detail as Record<string, unknown>).templateCode, 'team_member_count')
    assert.isUndefined(running.durationMs)

    const done = frames[2].data as Record<string, unknown>
    assert.equal(done.name, 'run_registered_query')
    assert.equal(done.callId, 'call-1')
    assert.equal(done.state, 'done')
    assert.equal(done.phase, 'target_identified')
    assert.isNumber(done.durationMs)
    assert.isAtLeast(done.durationMs as number, 0)
    assert.equal((done.detail as Record<string, unknown>).resultCount, 3)

    const firstPlan = frames[0].data as { steps: Array<{ key: string; state: string }> }
    assert.equal(firstPlan.steps[0].key, 'identify_target')
    assert.equal(firstPlan.steps[0].state, 'running')
    const lastPlan = frames[3].data as { steps: Array<{ key: string; state: string }> }
    assert.equal(lastPlan.steps[0].state, 'done')

    assert.deepEqual(completedNames, ['run_registered_query'])
    assert.isTrue(result.has('run_registered_query'))
  })

  test('emits confirmation and completes the plan for a management proposal', async ({
    assert,
  }) => {
    const { writes, response } = createFakeResponse()
    const confirmation = {
      id: 7,
      action: 'reset_two_factor',
      impact: { scope: 'single_user' },
      targetType: 'user',
      targetId: '42',
      targetSummary: { fullName: 'Ada Lovelace', email: 'ada@example.com' },
      changeSummary: [{ field: 'two_fa', value: 'disabled' }],
      expiresAt: null,
    }
    const run = createFakeRun([
      {
        name: 'propose_system_management_change',
        callId: 'call-2',
        input: { action: 'reset_two_factor' },
        status: Promise.resolve('finished'),
        output: Promise.resolve({
          artifact: { kind: 'confirmation', confirmation },
        }),
      },
    ])

    await streamAiAgentToolStatuses(run, response, new AbortController().signal)
    const frames = parseSse(writes)

    assert.deepEqual(
      frames.map((frame) => frame.event),
      ['agent_plan', 'agent_status', 'agent_status', 'agent_plan', 'agent_confirmation']
    )

    const running = frames[1].data as Record<string, unknown>
    assert.equal(running.callId, 'call-2')
    assert.equal((running.detail as Record<string, unknown>).action, 'reset_two_factor')

    const done = frames[2].data as Record<string, unknown>
    assert.equal(done.state, 'done')
    assert.equal((done.detail as Record<string, unknown>).targetType, 'user')
    assert.equal((done.detail as Record<string, unknown>).targetId, '42')
    assert.equal((done.detail as Record<string, unknown>).targetLabel, 'Ada Lovelace')

    const lastPlan = frames[3].data as { steps: Array<{ key: string; state: string }> }
    assert.equal(lastPlan.steps[0].state, 'done')
    assert.equal(lastPlan.steps[1].state, 'done')
    assert.equal(lastPlan.steps[2].state, 'running')

    assert.deepEqual(frames[4].data, confirmation)
  })

  test('keeps a denied proposal terminal frame as done with its error code', async ({ assert }) => {
    const { writes, response } = createFakeResponse()
    const run = createFakeRun([
      {
        name: 'propose_system_management_change',
        callId: 'call-3',
        input: { action: 'reset_two_factor' },
        status: Promise.resolve('finished'),
        output: Promise.resolve({
          artifact: {
            kind: 'action_error',
            code: 'permission_denied',
            message: 'You are not allowed to change two-factor settings',
          },
        }),
      },
    ])

    const result = await streamAiAgentToolStatuses(run, response, new AbortController().signal)
    const frames = parseSse(writes)

    const running = frames[1].data as Record<string, unknown>
    assert.equal(running.state, 'running')
    assert.equal(running.callId, 'call-3')

    const terminal = frames[2].data as Record<string, unknown>
    // A denial is the completion of an authorization check, so the frame keeps
    // state "done" but carries the machine-readable denial code.
    assert.equal(terminal.state, 'done')
    assert.equal(terminal.errorCode, 'permission_denied')
    assert.equal(terminal.callId, 'call-3')
    assert.isNumber(terminal.durationMs)

    const lastPlan = frames[3].data as { steps: Array<{ state: string }> }
    assert.equal(lastPlan.steps[1].state, 'done')
    assert.equal(lastPlan.steps[2].state, 'running')
    assert.isTrue(result.has('propose_system_management_change'))
  })

  test('throws AbortError before writing when the signal is already aborted', async ({
    assert,
  }) => {
    const { writes, response } = createFakeResponse()
    const controller = new AbortController()
    controller.abort()
    const run = createFakeRun([
      {
        name: 'run_registered_query',
        callId: 'call-4',
        input: { templateCode: 'team_member_count' },
        status: Promise.resolve('finished'),
        output: Promise.resolve({ kind: 'query_result', rows: [] }),
      },
    ])

    await assert.rejects(
      () => streamAiAgentToolStatuses(run, response, controller.signal),
      DOMException
    )
    assert.equal(writes.length, 0)
  })

  test('writeAiChatSse stops after the response has ended', async ({ assert }) => {
    const { writes, response, endResponse } = createFakeResponse()

    writeAiChatSse(response, 'delta', { content: 'hello' })
    endResponse()
    writeAiChatSse(response, 'delta', { content: 'world' })

    assert.deepEqual(writes, ['event: delta\n', 'data: {"content":"hello"}\n\n'])
  })
})
