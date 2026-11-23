import { DateTime } from 'luxon'

import { createAiAgentSystemPrompt } from '#ai/chat/ai_agent_service'
import {
  createAiEvaluationTools,
  getLatestEvaluationAssistantText,
  scoreAiEvaluationAnswer,
} from '#ai/evaluation/ai_evaluation'
import { getAiAgentEngine, getAiAgentModelConfig } from '#ai/runtime/ai_agent_runtime'
import AiEvaluationCase from '#models/ai_evaluation_case'
import type { AiEvaluationRunResult } from '#models/ai_evaluation_run'
import AiEvaluationRun from '#models/ai_evaluation_run'

const activeRunIds = new Set<number>()

export function redactEvaluationText(value: string) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [已脱敏]')
    .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b/g, '[已脱敏密钥]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[已脱敏邮箱]')
    .replace(/(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g, '[已脱敏手机号]')
    .replace(/((?:api[_-]?key|access[_-]?token|token|password)\s*[:=]\s*)[^\s,;]+/gi, '$1[已脱敏]')
    .slice(0, 8_000)
}

export function sanitizeAiEvaluationMockOutputs(
  value: Record<string, unknown>
): Record<string, unknown> {
  const sanitize = (item: unknown): unknown => {
    if (typeof item === 'string') return redactEvaluationText(item).slice(0, 2_000)
    if (Array.isArray(item)) return item.slice(0, 50).map(sanitize)
    if (item && typeof item === 'object') {
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>)
          .slice(0, 50)
          .map(([key, nested]) => [key.slice(0, 100), sanitize(nested)])
      )
    }
    return item
  }
  return sanitize(value) as Record<string, unknown>
}

export async function queueAiEvaluationRun(runId: number) {
  setTimeout(() => void executeAiEvaluationRun(runId), 0)
}

async function executeAiEvaluationRun(runId: number) {
  if (activeRunIds.has(runId)) return
  activeRunIds.add(runId)
  try {
    const run = await AiEvaluationRun.find(runId)
    if (!run || run.status !== 'queued') return
    run.status = 'running'
    run.startedAt = DateTime.now()
    await run.save()

    const cases = await AiEvaluationCase.query().whereIn('id', run.caseIds).orderBy('id', 'asc')
    const model = await getAiAgentModelConfig()
    const results: AiEvaluationRunResult[] = []

    for (const evaluationCase of cases) {
      const calledTools: string[] = []
      let actualAnswer = ''
      let error: string | undefined
      try {
        const session = await getAiAgentEngine().createSession({
          model,
          systemPrompt: createAiAgentSystemPrompt(),
          tools: createAiEvaluationTools(
            sanitizeAiEvaluationMockOutputs(evaluationCase.mockToolOutputs ?? {}),
            calledTools
          ),
          messages: [],
          sessionId: `ai-evaluation:${run.id}:${evaluationCase.id}`,
          telemetry: { enabled: false },
        })
        const conversationMessages = evaluationCase.conversationMessages ?? []
        const userPrompts = conversationMessages.length
          ? conversationMessages
              .filter((message) => message.role === 'user')
              .map(({ content }) => content)
          : [evaluationCase.question]
        const answers: string[] = []
        for (const prompt of userPrompts) {
          await session.prompt(redactEvaluationText(prompt))
          const answer = getLatestEvaluationAssistantText(session.getSessionState().messages)
          if (answer.trim()) answers.push(redactEvaluationText(answer))
        }
        actualAnswer = answers.join('\n\n')
      } catch {
        error = '模型调用失败，请检查模型配置和服务状态。'
      }

      const score = scoreAiEvaluationAnswer({
        expectedTools: evaluationCase.expectedTools ?? [],
        expectedToolSequence: evaluationCase.expectedToolSequence ?? [],
        requiredTerms: evaluationCase.requiredTerms ?? [],
        forbiddenTerms: evaluationCase.forbiddenTerms ?? [],
        actualTools: calledTools,
        answer: actualAnswer,
        referenceAnswer: evaluationCase.referenceAnswer,
      })
      results.push({
        caseId: evaluationCase.id,
        caseName: evaluationCase.name,
        question: evaluationCase.question,
        referenceAnswer: evaluationCase.referenceAnswer,
        actualAnswer,
        expectedTools: evaluationCase.expectedTools ?? [],
        actualTools: calledTools,
        toolsPassed: score.toolsPassed,
        referenceSimilarity: score.referenceSimilarity,
        requiredTerms: score.requiredTerms,
        forbiddenTerms: score.forbiddenTerms,
        score: error ? 0 : score.score,
        passed: !error && score.passed,
        ...(error ? { error } : {}),
      })
      run.results = [...results]
      run.completedCases = results.length
      await run.save()
    }

    run.score = results.length
      ? Math.round(results.reduce((total, result) => total + result.score, 0) / results.length)
      : 0
    run.status = 'completed'
    run.completedAt = DateTime.now()
    await run.save()
  } catch {
    const run = await AiEvaluationRun.find(runId).catch(() => null)
    if (run) {
      run.status = 'failed'
      run.error = '测评运行失败，请稍后重试。'
      run.completedAt = DateTime.now()
      await run.save().catch(() => undefined)
    }
  } finally {
    activeRunIds.delete(runId)
  }
}
