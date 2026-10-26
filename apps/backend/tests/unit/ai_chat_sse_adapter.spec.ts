import type { HttpContext } from '@adonisjs/core/http'
import { test } from '@japa/runner'

import type { createAiAgentStream } from '#ai/chat/ai_agent_service'
import { streamAiAgentToolStatuses, writeAiChatSse } from '#ai/chat/ai_chat_sse_adapter'

type FakeToolCall = {
  name: string
  callId: string
  input: unknown
  status: Promise<'finished' | 'error'>
  output: Promise<unknown>
  errorOutput?: unknown
  confirmation?: unknown
  updates?: unknown[]
}

function createFakeRun(toolCalls: FakeToolCall[], toolLabels = new Map<string, string>()) {
  async function* generate() {
    for (const toolCall of toolCalls) {
      yield {
        type: 'tool_execution_start',
        toolCallId: toolCall.callId,
        toolName: toolCall.name,
        args: toolCall.input,
      }
      if (toolCall.confirmation) {
        yield {
          type: 'app_confirmation_requested',
          toolCallId: toolCall.callId,
          confirmation: toolCall.confirmation,
        }
      }
      const state = await toolCall.status
      for (const partialResult of toolCall.updates ?? []) {
        yield {
          type: 'tool_execution_update',
          toolCallId: toolCall.callId,
          toolName: toolCall.name,
          args: toolCall.input,
          partialResult,
        }
      }
      yield {
        type: 'tool_execution_end',
        toolCallId: toolCall.callId,
        toolName: toolCall.name,
        result:
          state === 'error' && toolCall.errorOutput !== undefined
            ? { details: toolCall.errorOutput }
            : state === 'finished' && !toolCall.confirmation
              ? { details: await toolCall.output }
              : null,
        isError: state === 'error' || Boolean(toolCall.confirmation),
      }
    }
  }
  return {
    agentRunId: 'agent-run-1',
    stream: { events: generate() },
    toolLabels,
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
  test('shows a bounded, redacted reason and the MCP tool name when a tool fails', async ({
    assert,
  }) => {
    const { writes, response } = createFakeResponse()
    const run = createFakeRun([
      {
        name: 'mcp_read_2_search_logs_12345678',
        callId: 'mcp-failure',
        input: { limit: 1 },
        status: Promise.resolve('error'),
        output: Promise.resolve(null),
        errorOutput: {
          kind: 'action_error',
          code: 'failed',
          toolName: 'search_logs',
          message: 'Connection refused\nDetails unavailable. Bearer abc123 api_key="secret-value"',
        },
      },
    ])

    await streamAiAgentToolStatuses(run, response, new AbortController().signal)
    const failed = parseSse(writes)[1].data as Record<string, unknown>

    assert.equal(failed.state, 'error')
    assert.equal(failed.callId, 'mcp-failure')
    assert.equal(failed.message, 'Connection refused')
    assert.deepEqual(failed.detail, {
      toolName: 'search_logs',
      parameterSummary: [{ name: 'limit', type: 'number' }],
    })
  })

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
      ['agent_status', 'agent_status']
    )

    const running = frames[0].data as Record<string, unknown>
    assert.equal(running.name, 'run_registered_query')
    assert.equal(running.callId, 'call-1')
    assert.equal(running.state, 'running')
    assert.isUndefined(running.phase)
    assert.equal((running.detail as Record<string, unknown>).templateCode, 'team_member_count')
    assert.isUndefined(running.durationMs)

    const done = frames[1].data as Record<string, unknown>
    assert.equal(done.name, 'run_registered_query')
    assert.equal(done.callId, 'call-1')
    assert.equal(done.state, 'done')
    assert.isUndefined(done.phase)
    assert.isNumber(done.durationMs)
    assert.isAtLeast(done.durationMs as number, 0)
    assert.equal((done.detail as Record<string, unknown>).resultCount, 3)

    assert.deepEqual(completedNames, ['run_registered_query'])
    assert.isTrue(result.has('run_registered_query'))
  })

  test('maps Pi tool progress to bounded agent_status details', async ({ assert }) => {
    const { writes, response } = createFakeResponse()
    const run = createFakeRun([
      {
        name: 'search_knowledge',
        callId: 'call-progress',
        input: { query: 'status' },
        updates: [{ message: 'reading documents', progress: 42, secret: 'omit' }],
        status: Promise.resolve('finished'),
        output: Promise.resolve({ kind: 'query_result', rows: [] }),
      },
    ])

    await streamAiAgentToolStatuses(run, response, new AbortController().signal)
    const frames = parseSse(writes)
    assert.equal(frames.length, 3)
    assert.equal((frames[1].data as Record<string, unknown>).state, 'running')
    assert.deepEqual((frames[1].data as Record<string, unknown>).detail, {
      message: 'reading documents',
      progress: 42,
      parameterSummary: [{ name: 'query', type: 'string' }],
    })
  })

  test('shows MCP identity and safe parameter and result summaries', async ({ assert }) => {
    const { writes, response } = createFakeResponse()
    const name = 'mcp_read_server_lookup_12345678'
    const run = createFakeRun(
      [
        {
          name,
          callId: 'mcp-safe-summary',
          input: { filter: { email: 'person@example.com' }, api_token: 'secret-value', limit: 5 },
          status: Promise.resolve('finished'),
          output: Promise.resolve({
            kind: 'mcp_tool_result',
            toolName: 'lookup',
            resultSummary: { contentTypes: ['text'], textCharacters: 42 },
          }),
        },
      ],
      new Map([[name, 'Customer directory: lookup']])
    )

    await streamAiAgentToolStatuses(run, response, new AbortController().signal)
    const frames = parseSse(writes)
    const running = frames[0].data as Record<string, unknown>
    const completed = frames[1].data as Record<string, unknown>
    const runningDetail = running.detail as Record<string, unknown>
    const completedDetail = completed.detail as Record<string, unknown>

    assert.equal(running.displayName, 'Customer directory: lookup')
    assert.deepEqual(runningDetail.parameterSummary, [
      { name: 'filter', type: 'object' },
      { name: 'api_token', type: 'string' },
      { name: 'limit', type: 'number' },
    ])
    assert.deepEqual(completedDetail.resultSummary, {
      contentTypes: ['text'],
      textCharacters: 42,
    })
    assert.notInclude(writes.join(''), 'person@example.com')
    assert.notInclude(writes.join(''), 'secret-value')
  })

  test('shows loaded skill identity without exposing its instructions', async ({ assert }) => {
    const { writes, response } = createFakeResponse()
    const instructions = 'Private skill instructions'
    const run = createFakeRun([
      {
        name: 'load_agent_skill',
        callId: 'load-skill',
        input: { code: 'invoice-review' },
        status: Promise.resolve('finished'),
        output: Promise.resolve({
          kind: 'agent_skill',
          code: 'invoice-review',
          name: 'Invoice review',
          instructions,
        }),
      },
    ])

    await streamAiAgentToolStatuses(run, response, new AbortController().signal)
    const completed = parseSse(writes)[1].data as Record<string, unknown>
    const detail = completed.detail as Record<string, unknown>

    assert.deepInclude(detail, {
      skillCode: 'invoice-review',
      skillName: 'Invoice review',
      skillInstructionCharacters: instructions.length,
    })
    assert.notInclude(writes.join(''), instructions)
  })

  test('emits confirmation from the tool preflight and completes the plan', async ({ assert }) => {
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
        name: 'system_management_change',
        callId: 'call-2',
        input: { action: 'reset_two_factor' },
        status: Promise.resolve('finished'),
        output: Promise.resolve(null),
        confirmation,
      },
    ])

    await streamAiAgentToolStatuses(run, response, new AbortController().signal)
    const frames = parseSse(writes)

    assert.deepEqual(
      frames.map((frame) => frame.event),
      [
        'agent_plan',
        'agent_status',
        'agent_plan',
        'agent_confirmation',
        'agent_status',
        'agent_plan',
      ]
    )

    const running = frames[1].data as Record<string, unknown>
    assert.equal(running.callId, 'call-2')
    assert.equal((running.detail as Record<string, unknown>).action, 'reset_two_factor')

    const done = frames[4].data as Record<string, unknown>
    assert.equal(done.state, 'done')
    assert.equal(done.phase, 'awaiting_confirmation')
    assert.equal((done.detail as Record<string, unknown>).targetType, 'user')
    assert.equal((done.detail as Record<string, unknown>).targetId, '42')
    assert.equal((done.detail as Record<string, unknown>).targetLabel, 'Ada Lovelace')

    const lastPlan = frames[5].data as {
      steps: Array<{ key: string; state: string; startedAt?: number; durationMs?: number }>
    }
    assert.equal(lastPlan.steps[0].state, 'done')
    assert.isNumber(lastPlan.steps[0].durationMs)
    assert.equal(lastPlan.steps[1].state, 'done')
    assert.isNumber(lastPlan.steps[1].durationMs)
    assert.equal(lastPlan.steps[2].state, 'running')
    assert.isNumber(lastPlan.steps[2].startedAt)

    assert.deepEqual(frames[3].data, confirmation)
  })

  test('includes the configured MCP tool name while awaiting confirmation', async ({ assert }) => {
    const { writes, response } = createFakeResponse()
    const confirmation = {
      id: 9,
      action: 'call_mcp_tool',
      impact: { scope: 'single_user' },
      targetType: 'mcp_server_tool',
      targetId: '3:search_logs',
      targetSummary: { name: 'Application logs', toolName: 'search_logs' },
      changeSummary: [],
      expiresAt: null,
    }
    const run = createFakeRun([
      {
        name: 'mcp_confirm_3_search_logs_12345678',
        callId: 'mcp-call-1',
        input: { query: 'latest', limit: 1 },
        status: Promise.resolve('finished'),
        output: Promise.resolve(null),
        confirmation,
      },
    ])

    await streamAiAgentToolStatuses(run, response, new AbortController().signal)
    const done = parseSse(writes).find(
      (frame) => frame.event === 'agent_status' && frame.data?.state === 'done'
    )?.data as Record<string, unknown>

    assert.equal(done.phase, 'awaiting_confirmation')
    assert.equal((done.detail as Record<string, unknown>).targetLabel, 'Application logs')
    assert.equal((done.detail as Record<string, unknown>).toolName, 'search_logs')
    assert.equal((done.detail as Record<string, unknown>).confirmationId, 9)
  })

  test('derives the action from the dedicated API Key tool name', async ({ assert }) => {
    const { writes, response } = createFakeResponse()
    const confirmation = {
      id: 8,
      action: 'revoke_api_key',
      impact: { scope: 'single_user' },
      targetType: 'api_key',
      targetId: '19',
      targetSummary: { name: '测试密钥', prefix: 'tk' },
      changeSummary: [{ field: 'result', value: 'revoked' }],
      expiresAt: null,
    }
    const run = createFakeRun([
      {
        name: 'revoke_api_key',
        callId: 'call-5',
        input: { apiKeyId: 19 },
        status: Promise.resolve('finished'),
        output: Promise.resolve(null),
        confirmation,
      },
    ])

    const result = await streamAiAgentToolStatuses(run, response, new AbortController().signal)
    const frames = parseSse(writes)

    assert.deepEqual(
      frames.map((frame) => frame.event),
      [
        'agent_plan',
        'agent_status',
        'agent_plan',
        'agent_confirmation',
        'agent_status',
        'agent_plan',
      ]
    )

    const running = frames[1].data as Record<string, unknown>
    assert.equal(running.state, 'running')
    assert.equal((running.detail as Record<string, unknown>).action, 'revoke_api_key')
    assert.equal(running.phase, 'preparing_action')

    const done = frames[4].data as Record<string, unknown>
    assert.equal(done.state, 'done')
    assert.equal((done.detail as Record<string, unknown>).targetType, 'api_key')
    assert.equal((done.detail as Record<string, unknown>).targetId, '19')
    assert.equal((done.detail as Record<string, unknown>).targetLabel, '测试密钥')

    const lastPlan = frames[5].data as {
      steps: Array<{ key: string; state: string; durationMs?: number }>
    }
    assert.equal(lastPlan.steps[0].state, 'done')
    assert.equal(lastPlan.steps[1].state, 'done')
    assert.isNumber(lastPlan.steps[1].durationMs)
    assert.equal(lastPlan.steps[2].state, 'running')

    assert.deepEqual(frames[3].data, confirmation)
    assert.isFalse(result.has('revoke_api_key'))
  })

  test('keeps a denied proposal terminal frame as done with its error code', async ({ assert }) => {
    const { writes, response } = createFakeResponse()
    const run = createFakeRun([
      {
        name: 'system_management_change',
        callId: 'call-3',
        input: { action: 'reset_two_factor' },
        status: Promise.resolve('finished'),
        output: Promise.resolve({
          kind: 'action_error',
          code: 'permission_denied',
          message: 'You are not allowed to change two-factor settings',
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
    assert.notExists(terminal.phase)

    const lastPlan = frames[3].data as { steps: Array<{ state: string }> }
    assert.equal(lastPlan.steps[1].state, 'done')
    assert.equal(lastPlan.steps[2].state, 'pending')
    assert.notInclude(
      frames.map((frame) => frame.event),
      'agent_confirmation'
    )
    assert.isTrue(result.has('system_management_change'))
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
