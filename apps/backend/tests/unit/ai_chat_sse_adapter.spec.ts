import type { HttpContext } from '@adonisjs/core/http'
import type { AgentEvent, AgentToolResult } from '@api-starter-kit/ai-agent'
import { test } from '@japa/runner'

import type { createAiAgentStream } from '#ai/chat/ai_agent_service'
import type { AiAgentTurnEvent } from '#ai/chat/ai_chat_sse_adapter'
import {
  streamAiAgentToolStatuses,
  streamAiAgentTurnEvents,
  writeAiChatSse,
} from '#ai/chat/ai_chat_sse_adapter'

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

function createFakeRun(toolCalls: FakeToolCall[]) {
  async function* generate(): AsyncGenerator<AgentEvent> {
    for (const toolCall of toolCalls) {
      yield {
        type: 'tool_start',
        toolCallId: toolCall.callId,
        toolName: toolCall.name,
        args: toolCall.input,
      }
      if (toolCall.confirmation) {
        yield {
          type: 'confirmation_requested',
          toolCallId: toolCall.callId,
          confirmation: toolCall.confirmation,
        }
      }
      const state = await toolCall.status
      for (const partialResult of toolCall.updates ?? []) {
        yield {
          type: 'tool_update',
          toolCallId: toolCall.callId,
          toolName: toolCall.name,
          args: toolCall.input,
          partialResult,
        }
      }
      const result: AgentToolResult = {
        content: [],
        details:
          state === 'error' && toolCall.errorOutput !== undefined
            ? toolCall.errorOutput
            : state === 'finished' && !toolCall.confirmation
              ? await toolCall.output
              : undefined,
      }
      yield {
        type: 'tool_end',
        toolCallId: toolCall.callId,
        toolName: toolCall.name,
        result,
        isError: state === 'error' || Boolean(toolCall.confirmation),
      }
    }
  }
  return createFakeEventRun(generate())
}

const testUsage = {
  input: 1,
  output: 1,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 2,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
}

function assistantMessage(text: string, hasToolCall = false, stopReason = 'stop'): AgentEvent {
  return {
    type: 'message_end',
    message: {
      providerId: 'test-provider',
      modelId: 'test-model',
      text,
      hasToolCall,
      usage: testUsage,
      stopReason,
    },
  }
}

function messageStart(): AgentEvent {
  return { type: 'message_start', role: 'assistant' }
}

function textDelta(delta: string): AgentEvent {
  return { type: 'text_delta', delta }
}

function toolCallStart(): AgentEvent {
  return { type: 'tool_call_start' }
}

function toolStart(toolCallId: string, toolName: string, args: unknown): AgentEvent {
  return { type: 'tool_start', toolCallId, toolName, args }
}

function toolEnd(
  toolCallId: string,
  toolName: string,
  details: unknown,
  isError = false
): AgentEvent {
  return {
    type: 'tool_end',
    toolCallId,
    toolName,
    result: { content: [], details },
    isError,
  }
}

function createFakeEventRun(events: Iterable<AgentEvent> | AsyncIterable<AgentEvent>) {
  async function* generate(): AsyncGenerator<AgentEvent> {
    for await (const event of events) yield event
  }
  return {
    agentRunId: 'agent-run-1',
    session: { events: generate() },
    model: { baseUrl: 'https://chat.example' },
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
  test('routes tool-call text to details and final text to the assistant response', async ({
    assert,
  }) => {
    const events: AgentEvent[] = [
      messageStart(),
      textDelta('抱歉，我重新查一下。'),
      toolCallStart(),
      assistantMessage('抱歉，我重新查一下。', true, 'toolUse'),
      toolStart('call-skill', 'bash', {}),
      toolEnd('call-skill', 'bash', { kind: 'skill_script_result' }),
      messageStart(),
      textDelta('可用空间是 '),
      textDelta('72 GiB。'),
      assistantMessage('可用空间是 72 GiB。'),
    ]
    const output: AiAgentTurnEvent[] = []

    for await (const event of streamAiAgentTurnEvents(
      createFakeEventRun(events),
      new AbortController().signal,
      { captureModelText: true }
    )) {
      output.push(event)
    }

    assert.deepEqual(
      output
        .filter(
          (event): event is Extract<AiAgentTurnEvent, { source: 'model_text_delta' }> =>
            event.source === 'model_text_delta'
        )
        .map((event) => event.value),
      ['抱歉，我重新查一下。']
    )

    assert.deepEqual(
      output
        .filter(
          (event): event is Extract<AiAgentTurnEvent, { source: 'message_delta' }> =>
            event.source === 'message_delta'
        )
        .map((event) => event.value),
      ['可用空间是 ', '72 GiB。']
    )
    assert.isBelow(
      output.findIndex((event) => event.source === 'model_text_delta'),
      output.findIndex((event) => event.source === 'message_end')
    )

    assert.deepEqual(
      output
        .filter(
          (event): event is Extract<AiAgentTurnEvent, { source: 'message_end' }> =>
            event.source === 'message_end'
        )
        .map(({ value }) => ({ hasToolCall: value.hasToolCall, text: value.text })),
      [
        { hasToolCall: true, text: '抱歉，我重新查一下。' },
        { hasToolCall: false, text: '可用空间是 72 GiB。' },
      ]
    )
  })

  test('streams tool-enabled final text to the assistant response without exposing it as intermediate', async ({
    assert,
  }) => {
    const events: AgentEvent[] = [
      messageStart(),
      textDelta('直接回答。'),
      assistantMessage('直接回答。'),
    ]
    const output: AiAgentTurnEvent[] = []

    for await (const event of streamAiAgentTurnEvents(
      createFakeEventRun(events),
      new AbortController().signal,
      { captureModelText: true }
    )) {
      output.push(event)
    }

    assert.deepEqual(
      output
        .filter(
          (event): event is Extract<AiAgentTurnEvent, { source: 'message_delta' }> =>
            event.source === 'message_delta'
        )
        .map((event) => event.value),
      ['直接回答。']
    )
    assert.deepEqual(
      output.filter((event) => event.source === 'model_text_delta'),
      []
    )
  })

  test('streams text deltas directly for a tool-free final response', async ({ assert }) => {
    const events: AgentEvent[] = [
      messageStart(),
      textDelta('磁盘 '),
      textDelta('可用空间 72 GiB。'),
      assistantMessage('磁盘 可用空间 72 GiB。'),
    ]
    const output: AiAgentTurnEvent[] = []

    for await (const event of streamAiAgentTurnEvents(
      createFakeEventRun(events),
      new AbortController().signal,
      { streamText: true }
    )) {
      output.push(event)
    }

    assert.deepEqual(
      output
        .filter(
          (event): event is Extract<AiAgentTurnEvent, { source: 'message_delta' }> =>
            event.source === 'message_delta'
        )
        .map((event) => event.value),
      ['磁盘 ', '可用空间 72 GiB。']
    )
    assert.isBelow(
      output.findIndex((event) => event.source === 'message_delta'),
      output.findIndex((event) => event.source === 'message_end')
    )
  })

  test('streams the post-tool final answer as candidate deltas before the model response ends', async ({
    assert,
  }) => {
    const events: AgentEvent[] = [
      toolStart('call-read', 'read_system_info', {}),
      toolEnd('call-read', 'read_system_info', { kind: 'system_info' }),
      messageStart(),
      textDelta('可用空间 '),
      textDelta('为 72 GiB。'),
      assistantMessage('可用空间 为 72 GiB。'),
    ]
    const output: AiAgentTurnEvent[] = []

    for await (const event of streamAiAgentTurnEvents(
      createFakeEventRun(events),
      new AbortController().signal,
      { captureModelText: true, streamTextAfterToolExecution: true }
    )) {
      output.push(event)
    }

    assert.deepEqual(
      output
        .filter(
          (event): event is Extract<AiAgentTurnEvent, { source: 'message_candidate_delta' }> =>
            event.source === 'message_candidate_delta'
        )
        .map((event) => event.value),
      ['可用空间 ', '为 72 GiB。']
    )
    assert.isBelow(
      output.findIndex((event) => event.source === 'message_candidate_delta'),
      output.findIndex((event) => event.source === 'message_end')
    )
  })

  test('reclassifies streamed pre-tool text into runtime details if another tool call starts', async ({
    assert,
  }) => {
    const events: AgentEvent[] = [
      toolStart('call-first', 'read_first', {}),
      toolEnd('call-first', 'read_first', { kind: 'read_result' }),
      messageStart(),
      textDelta('先读取配置。'),
      toolCallStart(),
      assistantMessage('先读取配置。', true, 'toolUse'),
    ]
    const output: AiAgentTurnEvent[] = []

    for await (const event of streamAiAgentTurnEvents(
      createFakeEventRun(events),
      new AbortController().signal,
      { captureModelText: true, streamTextAfterToolExecution: true }
    )) {
      output.push(event)
    }

    assert.deepEqual(
      output
        .filter((event) => ['message_candidate_clear', 'model_text_delta'].includes(event.source))
        .map((event) => event.source),
      ['message_candidate_clear', 'model_text_delta']
    )
  })

  test('shows skill inputs and bounded script output in tool runtime details', async ({
    assert,
  }) => {
    const output = {
      kind: 'skill_script_result',
      code: 'system-info',
      scriptPath: 'scripts/index.mjs',
      exitCode: 0,
      stdout: '{"availableBytes":123}',
      runtimeContext: { token: 'must not be displayed' },
    }
    const events: AgentEvent[] = [
      toolStart('call-skill-script', 'bash', {
        code: 'system-info',
        scriptPath: 'scripts/index.mjs',
        args: ['disk'],
      }),
      toolEnd('call-skill-script', 'bash', output),
    ]
    const frames: Array<Extract<AiAgentTurnEvent, { source: 'frame' }>['value']> = []

    for await (const event of streamAiAgentTurnEvents(
      createFakeEventRun(events),
      new AbortController().signal,
      { captureModelText: true }
    )) {
      if (event.source === 'frame') frames.push(event.value)
    }

    const completed = frames.find(
      (frame) => frame.event === 'agent_status' && frame.data.state === 'done'
    )
    assert.isDefined(completed)
    if (completed?.event !== 'agent_status') return
    assert.equal(
      completed.data.detail?.inputPreview,
      '技能：system-info\n脚本：scripts/index.mjs\n参数数：1'
    )
    assert.deepEqual(JSON.parse(String(completed.data.detail?.outputPreview ?? '{}')), {
      availableBytes: 123,
    })
    assert.notInclude(JSON.stringify(completed.data.detail), 'must not be displayed')
  })

  test('shows a bounded, redacted reason when a tool fails', async ({ assert }) => {
    const { writes, response } = createFakeResponse()
    const run = createFakeRun([
      {
        name: 'search_knowledge',
        callId: 'read-tool-failure',
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
    assert.equal(failed.callId, 'read-tool-failure')
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

  test('maps Agent tool progress to bounded agent_status details', async ({ assert }) => {
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

  test('includes the configured tool name while awaiting confirmation', async ({ assert }) => {
    const { writes, response } = createFakeResponse()
    const confirmation = {
      id: 9,
      action: 'call_builtin_tool',
      impact: { scope: 'single_user' },
      targetType: 'builtin_tool',
      targetId: 'run_registered_query',
      targetSummary: { name: 'System data query', toolName: 'run_registered_query' },
      changeSummary: [],
      expiresAt: null,
    }
    const run = createFakeRun([
      {
        name: 'run_registered_query',
        callId: 'builtin-call-1',
        input: { templateCode: 'team_member_count' },
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
    assert.equal((done.detail as Record<string, unknown>).targetLabel, 'System data query')
    assert.equal((done.detail as Record<string, unknown>).toolName, 'run_registered_query')
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
