export type AiEvaluationTurn = {
  question: string
  expectedTools: string[]
  expectedToolSequence?: string[]
  expectedAnswerIncludes?: string[]
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
        expectedTools: ['search_knowledge_catalog', 'search_knowledge'],
        expectedToolSequence: ['search_knowledge_catalog', 'search_knowledge'],
      },
    ],
  },
  {
    name: 'product guidance',
    turns: [
      {
        question: '如何启动 API Starter Kit 项目？',
        expectedTools: ['search_knowledge_catalog', 'search_knowledge'],
        expectedToolSequence: ['search_knowledge_catalog', 'search_knowledge'],
      },
    ],
  },
  {
    name: 'latest log anomaly review uses the enabled skill',
    turns: [
      {
        question: '查一下最近日志有没有异常。',
        expectedTools: [
          'list_agent_skills',
          'load_agent_skill',
          'list_log_services',
          'search_logs',
        ],
        expectedToolSequence: [
          'list_agent_skills',
          'load_agent_skill',
          'list_log_services',
          'search_logs',
        ],
        expectedAnswerIncludes: ['backend', 'warn'],
        toolOutputs: {
          list_agent_skills: {
            kind: 'agent_skills',
            skills: [
              {
                code: 'latest-log-review',
                name: '日志查询与异常检查',
                description: '适用于用户询问最新、最近日志，或判断日志是否异常的请求。',
              },
            ],
          },
          load_agent_skill: {
            kind: 'agent_skill',
            code: 'latest-log-review',
            name: '日志查询与异常检查',
            instructions:
              '发现服务后自动查询。检查异常时读取每个服务最新 20 条，省略级别和时间筛选，并按实际返回结果说明范围。',
          },
          list_log_services: { servicesAvailable: ['backend'] },
          search_logs: {
            service: 'backend',
            totalMatches: 1,
            items: [
              {
                service: 'backend',
                timestampLocal: '2026-10-26 09:32:42 (Asia/Shanghai)',
                level: 'warn',
                message: 'Slow request',
              },
            ],
          },
        },
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
        expectedTools: ['revoke_api_key'],
      },
    ],
  },
  {
    name: 'name-based controlled operation',
    turns: [
      {
        question: '请吊销名为测试密钥的 API Key。',
        expectedTools: ['revoke_api_key'],
      },
    ],
  },
  {
    name: 'knowledge versus live data routing',
    turns: [
      {
        question: '如何在系统中维护知识库？',
        expectedTools: ['search_knowledge_catalog', 'search_knowledge'],
        expectedToolSequence: ['search_knowledge_catalog', 'search_knowledge'],
      },
      {
        question: '列出当前权限目录。',
        expectedTools: ['run_registered_query'],
      },
    ],
  },
  {
    name: 'configured action without user RBAC checks',
    turns: [
      {
        question: '请吊销 ID 为 19 的测试密钥。',
        expectedTools: ['revoke_api_key'],
        toolOutputs: {
          revoke_api_key: {
            kind: 'action_result',
            status: 'simulated',
          },
        },
      },
    ],
  },
  {
    name: 'read tool fallback after query failure',
    turns: [
      {
        question:
          '请先查询当前 super-admin 角色的权限。如果系统数据查询失败，再查项目文档解释 RBAC 权限如何分配，并明确当前角色权限无法确认。',
        expectedTools: ['run_registered_query', 'search_knowledge_catalog', 'search_knowledge'],
        expectedToolSequence: [
          'run_registered_query',
          'search_knowledge_catalog',
          'search_knowledge',
        ],
        expectedAnswerIncludes: ['RBAC', '无法确认'],
        toolOutputs: {
          run_registered_query: {
            kind: 'query_error',
            code: 'failed',
            message: '系统角色数据读取暂时失败',
          },
          search_knowledge_catalog: {
            sources: [
              { documentId: 1, title: 'RBAC 权限设计', summary: '角色组合权限后分配给用户' },
            ],
          },
          search_knowledge: {
            sources: [
              {
                documentId: 1,
                title: 'RBAC 权限设计',
                chunkId: 1,
                excerpt: '系统使用 RBAC，角色通过权限组合分配给用户。',
              },
            ],
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
  assistantText?: string
}) {
  const expectedTools = [...input.evaluation.expectedTools].sort()
  const calledTools = [...input.calledTools].sort()
  const toolsPassed =
    expectedTools.length === calledTools.length &&
    expectedTools.every((toolName, index) => toolName === calledTools[index])
  const sequencePassed =
    !input.evaluation.expectedToolSequence ||
    (input.evaluation.expectedToolSequence.length === input.calledTools.length &&
      input.evaluation.expectedToolSequence.every(
        (toolName, index) => toolName === input.calledTools[index]
      ))
  const answerPassed = (input.evaluation.expectedAnswerIncludes ?? []).every((text) =>
    (input.assistantText ?? '').includes(text)
  )

  return {
    passed: toolsPassed && sequencePassed && answerPassed,
    toolsPassed,
    sequencePassed,
    answerPassed,
  }
}
