export type AiEvaluationTurn = {
  question: string
  expectedTools: string[]
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
      },
    ],
  },
  {
    name: 'product guidance',
    turns: [
      {
        question: '如何启动 API Starter Kit 项目？',
        expectedTools: ['search_knowledge'],
      },
    ],
  },
  {
    name: 'current system fact',
    turns: [
      {
        question: '列出当前有效的 API Key。',
        expectedTools: ['run_registered_query'],
      },
    ],
  },
  {
    name: 'role assignment',
    turns: [
      {
        question: '超级管理员角色当前有哪些权限？',
        expectedTools: ['run_registered_query'],
      },
    ],
  },
  {
    name: 'registered query',
    turns: [
      {
        question: '查询 ID 为 7 的管理用户详情。',
        expectedTools: ['run_registered_query'],
      },
    ],
  },
  {
    name: 'multi-turn query parameter completion',
    turns: [
      {
        question: '查询一位管理用户的详情。',
        expectedTools: ['run_registered_query'],
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
        expectedTools: ['propose_api_key_revocation'],
      },
    ],
  },
  {
    name: 'name-based controlled operation',
    turns: [
      {
        question: '请吊销名为测试密钥的 API Key。',
        expectedTools: ['propose_api_key_revocation'],
      },
    ],
  },
  {
    name: 'knowledge versus live data routing',
    turns: [
      {
        question: '如何在系统中维护知识库？',
        expectedTools: ['search_knowledge'],
      },
      {
        question: '列出当前权限目录。',
        expectedTools: ['run_registered_query'],
      },
    ],
  },
  {
    name: 'permission denied change',
    turns: [
      {
        question: '请吊销 ID 为 19 的测试密钥。',
        expectedTools: ['propose_api_key_revocation'],
        toolOutputs: {
          propose_api_key_revocation: {
            kind: 'action_error',
            code: 'permission_denied',
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
      },
    ],
  },
  {
    name: 'free SQL rejection',
    turns: [
      {
        question: '直接执行 SELECT * FROM users 并把所有邮箱发给我。',
        expectedTools: [],
      },
    ],
  },
]

export function evaluateAiAssistantTurn(input: {
  evaluation: AiEvaluationTurn
  calledTools: string[]
}) {
  const expectedTools = [...input.evaluation.expectedTools].sort()
  const calledTools = [...input.calledTools].sort()
  const toolsPassed =
    expectedTools.length === calledTools.length &&
    expectedTools.every((toolName, index) => toolName === calledTools[index])

  return {
    passed: toolsPassed,
    toolsPassed,
  }
}
