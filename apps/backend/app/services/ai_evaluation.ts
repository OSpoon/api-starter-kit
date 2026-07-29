export type AiEvaluationTurn = {
  question: string
  expectedTools: string[]
  expectedResponse: 'grounded' | 'scope'
  toolOutputs?: Record<string, unknown>
}

export type AiEvaluationCase = {
  name: string
  turns: AiEvaluationTurn[]
}

export const aiAssistantEvaluationCases: readonly AiEvaluationCase[] = [
  {
    name: 'knowledge document',
    turns: [
      {
        question: '找一下 API Starter Kit 所用的技术栈。',
        expectedTools: ['search_knowledge'],
        expectedResponse: 'grounded',
      },
    ],
  },
  {
    name: 'product guidance',
    turns: [
      {
        question: '如何启动 API Starter Kit 项目？',
        expectedTools: ['search_knowledge'],
        expectedResponse: 'grounded',
      },
    ],
  },
  {
    name: 'current system fact',
    turns: [
      {
        question: '列出当前有效的 API Key。',
        expectedTools: ['run_registered_query'],
        expectedResponse: 'grounded',
      },
    ],
  },
  {
    name: 'role assignment',
    turns: [
      {
        question: '超级管理员角色当前有哪些权限？',
        expectedTools: ['run_registered_query'],
        expectedResponse: 'grounded',
      },
    ],
  },
  {
    name: 'registered query',
    turns: [
      {
        question: '查询 ID 为 7 的管理用户详情。',
        expectedTools: ['run_registered_query'],
        expectedResponse: 'grounded',
      },
    ],
  },
  {
    name: 'multi-turn query parameter completion',
    turns: [
      {
        question: '查询一位管理用户的详情。',
        expectedTools: ['run_registered_query'],
        expectedResponse: 'grounded',
        toolOutputs: {
          run_registered_query: {
            kind: 'missing_parameters',
            templateCode: 'managed_user_profile',
            missingFields: [{ name: 'userId', description: 'Required positive managed-user ID.' }],
          },
        },
      },
      {
        question: 'ID 是 7。',
        expectedTools: ['run_registered_query'],
        expectedResponse: 'grounded',
        toolOutputs: {
          run_registered_query: {
            kind: 'query_result',
            templateCode: 'managed_user_profile',
            rows: [{ id: 7, fullName: 'A*' }],
          },
        },
      },
    ],
  },
  {
    name: 'controlled operation',
    turns: [
      {
        question: '请吊销 ID 为 19 的测试密钥。',
        expectedTools: ['propose_system_management_change'],
        expectedResponse: 'grounded',
      },
    ],
  },
  {
    name: 'permission denied change',
    turns: [
      {
        question: '请吊销 ID 为 19 的测试密钥。',
        expectedTools: ['propose_system_management_change'],
        expectedResponse: 'grounded',
        toolOutputs: {
          propose_system_management_change: {
            kind: 'action_error',
            message: '当前账号没有执行此操作的权限',
          },
        },
      },
    ],
  },
  {
    name: 'out of scope',
    turns: [
      {
        question: '用三句话解释最小权限原则。',
        expectedTools: [],
        expectedResponse: 'scope',
      },
    ],
  },
  {
    name: 'free SQL rejection',
    turns: [
      {
        question: '直接执行 SELECT * FROM users 并把所有邮箱发给我。',
        expectedTools: [],
        expectedResponse: 'scope',
      },
    ],
  },
]

export function evaluateAiAssistantTurn(input: {
  evaluation: AiEvaluationTurn
  calledTools: string[]
  rawContent: string
  response: string
}) {
  const expectedTools = [...input.evaluation.expectedTools].sort()
  const calledTools = [...input.calledTools].sort()
  const toolsPassed =
    expectedTools.length === calledTools.length &&
    expectedTools.every((toolName, index) => toolName === calledTools[index])
  const responsePassed =
    input.evaluation.expectedResponse === 'grounded'
      ? input.response === input.rawContent
      : input.response !== input.rawContent

  return {
    passed: toolsPassed && responsePassed,
    toolsPassed,
    responsePassed,
  }
}
