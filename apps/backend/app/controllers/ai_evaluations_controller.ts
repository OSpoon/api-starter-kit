import type { HttpContext } from '@adonisjs/core/http'
import {
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
} from '@foadonis/openapi/decorators'
import vine from '@vinejs/vine'

import { aiEvaluationToolNames } from '#ai/evaluation/ai_evaluation'
import { getAiAgentModelConfig } from '#ai/runtime/ai_agent_runtime'
import AiChatConversation from '#models/ai_chat_conversation'
import AiChatMessage from '#models/ai_chat_message'
import AiEvaluationCase from '#models/ai_evaluation_case'
import AiEvaluationRun from '#models/ai_evaluation_run'
import {
  queueAiEvaluationRun,
  redactEvaluationText,
  sanitizeAiEvaluationMockOutputs,
} from '#services/ai_evaluation_service'
import { clampLimit } from '#support/pagination'
import {
  aiEvaluationCaseValidator,
  aiEvaluationConversationImportValidator,
  aiEvaluationListValidator,
  aiEvaluationRunListValidator,
  aiEvaluationRunValidator,
} from '#validators/ai_evaluation'

import {
  type ApiSchema,
  dataEnvelope,
  errorResponseSchema,
  paginatedDataEnvelope,
} from '../openapi/response_schemas.js'

const idValidator = vine.compile(vine.object({ id: vine.number().withoutDecimals().positive() }))

const evaluationCaseSchema: ApiSchema = {
  type: 'object',
  required: [
    'id',
    'name',
    'question',
    'referenceAnswer',
    'expectedTools',
    'expectedToolSequence',
    'requiredTerms',
    'forbiddenTerms',
    'mockToolOutputs',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'integer' },
    sourceConversationId: { type: 'integer', nullable: true },
    name: { type: 'string' },
    question: { type: 'string' },
    referenceAnswer: { type: 'string' },
    expectedTools: { type: 'array', items: { type: 'string' } },
    expectedToolSequence: { type: 'array', items: { type: 'string' } },
    requiredTerms: { type: 'array', items: { type: 'string' } },
    forbiddenTerms: { type: 'array', items: { type: 'string' } },
    mockToolOutputs: { type: 'object', additionalProperties: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
}

const evaluationRunSchema: ApiSchema = {
  type: 'object',
  required: [
    'id',
    'status',
    'modelId',
    'caseIds',
    'totalCases',
    'completedCases',
    'results',
    'error',
    'startedAt',
    'completedAt',
    'createdAt',
  ],
  properties: {
    id: { type: 'integer' },
    status: { type: 'string', enum: ['queued', 'running', 'completed', 'failed', 'cancelled'] },
    modelId: { type: 'string' },
    caseIds: { type: 'array', items: { type: 'integer' } },
    totalCases: { type: 'integer' },
    completedCases: { type: 'integer' },
    score: { type: 'number', nullable: true },
    results: { type: 'array', items: { type: 'object', additionalProperties: true } },
    error: { type: 'string', nullable: true },
    startedAt: { type: 'string', nullable: true, format: 'date-time' },
    completedAt: { type: 'string', nullable: true, format: 'date-time' },
    createdAt: { type: 'string', format: 'date-time' },
  },
}

function serializeCase(evaluationCase: AiEvaluationCase) {
  return {
    id: evaluationCase.id,
    sourceConversationId: evaluationCase.sourceConversationId,
    name: evaluationCase.name,
    question: evaluationCase.question,
    referenceAnswer: evaluationCase.referenceAnswer,
    expectedTools: evaluationCase.expectedTools ?? [],
    expectedToolSequence: evaluationCase.expectedToolSequence ?? [],
    requiredTerms: evaluationCase.requiredTerms ?? [],
    forbiddenTerms: evaluationCase.forbiddenTerms ?? [],
    mockToolOutputs: sanitizeAiEvaluationMockOutputs(evaluationCase.mockToolOutputs ?? {}),
    createdAt: evaluationCase.createdAt.toISO() ?? '',
    updatedAt: evaluationCase.updatedAt.toISO() ?? '',
  }
}

function serializeRun(run: AiEvaluationRun) {
  return {
    id: run.id,
    status: run.status,
    modelId: run.modelId,
    caseIds: run.caseIds ?? [],
    totalCases: run.totalCases,
    completedCases: run.completedCases,
    score: run.score,
    results: run.results ?? [],
    error: run.error,
    startedAt: run.startedAt?.toISO() ?? null,
    completedAt: run.completedAt?.toISO() ?? null,
    createdAt: run.createdAt.toISO() ?? '',
  }
}

function validateToolNames(payload: {
  expectedTools?: string[]
  expectedToolSequence?: string[]
  mockToolOutputs?: Record<string, unknown>
}) {
  const values = [
    ...(payload.expectedTools ?? []),
    ...(payload.expectedToolSequence ?? []),
    ...Object.keys(payload.mockToolOutputs ?? {}),
  ]
  return (
    !values.some((name) => !aiEvaluationToolNames.includes(name as never)) &&
    JSON.stringify(payload.mockToolOutputs ?? {}).length <= 12_000
  )
}

@ApiSecurity('bearerAuth')
export default class AiEvaluationsController {
  @ApiOperation({ summary: '获取测评条目列表' })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1 } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
  })
  @ApiQuery({ name: 'name', required: false, schema: { type: 'string', maxLength: 200 } })
  @ApiQuery({ name: 'question', required: false, schema: { type: 'string', maxLength: 200 } })
  @ApiQuery({
    name: 'source',
    required: false,
    schema: { type: 'string', enum: ['chat', 'manual'] },
  })
  @ApiResponse({
    status: 200,
    description: '测评条目分页列表',
    schema: paginatedDataEnvelope(evaluationCaseSchema),
  })
  async index({ request, serialize }: HttpContext) {
    const payload = await aiEvaluationListValidator.validate(request.qs())
    const query = AiEvaluationCase.query().orderBy('updated_at', 'desc')
    if (payload.source === 'chat') query.whereNotNull('source_conversation_id')
    if (payload.source === 'manual') query.whereNull('source_conversation_id')
    if (payload.name) query.whereILike('name', `%${payload.name}%`)
    if (payload.question) query.whereILike('question', `%${payload.question}%`)
    const paginator = await query.paginate(payload.page ?? 1, clampLimit(payload.limit, 20, 100))
    return serialize({ items: paginator.all().map(serializeCase), meta: paginator.getMeta() })
  }

  @ApiOperation({ summary: '创建测评条目' })
  @ApiBody({ type: () => aiEvaluationCaseValidator, required: true })
  @ApiResponse({
    status: 200,
    description: '已创建的测评条目',
    schema: dataEnvelope(evaluationCaseSchema),
  })
  @ApiResponse({
    status: 422,
    description: '字段无效、关联会话不可用或工具名称无效',
    schema: errorResponseSchema,
  })
  async store({ request, auth, response, serialize }: HttpContext) {
    const payload = await aiEvaluationCaseValidator.validate(request.all())
    if (!validateToolNames(payload)) {
      return response.unprocessableEntity({ message: '工具名称无效，或模拟工具结果超过 12 KB。' })
    }
    if (payload.sourceConversationId) {
      const conversation = await AiChatConversation.query()
        .where('id', payload.sourceConversationId)
        .where('user_id', auth.getUserOrFail().id)
        .whereNull('api_key_id')
        .first()
      if (!conversation) return response.unprocessableEntity({ message: '引用的聊天会话不可用。' })
    }
    const evaluationCase = await AiEvaluationCase.create({
      sourceConversationId: payload.sourceConversationId ?? null,
      name: payload.name,
      question: redactEvaluationText(payload.question),
      referenceAnswer: redactEvaluationText(payload.referenceAnswer),
      expectedTools: payload.expectedTools ?? [],
      expectedToolSequence: payload.expectedToolSequence ?? [],
      requiredTerms: payload.requiredTerms ?? [],
      forbiddenTerms: payload.forbiddenTerms ?? [],
      mockToolOutputs: sanitizeAiEvaluationMockOutputs(payload.mockToolOutputs ?? {}),
    })
    return serialize(serializeCase(evaluationCase))
  }

  @ApiOperation({ summary: '更新测评条目' })
  @ApiBody({ type: () => aiEvaluationCaseValidator, required: true })
  @ApiResponse({
    status: 200,
    description: '已更新的测评条目',
    schema: dataEnvelope(evaluationCaseSchema),
  })
  @ApiResponse({ status: 404, description: '测评条目不存在', schema: errorResponseSchema })
  @ApiResponse({
    status: 422,
    description: '字段无效、关联会话不可用或工具名称无效',
    schema: errorResponseSchema,
  })
  async update({ request, auth, response, serialize }: HttpContext) {
    const payload = await aiEvaluationCaseValidator.validate(request.all())
    const { id } = await idValidator.validate({ id: request.param('id') })
    if (!validateToolNames(payload)) {
      return response.unprocessableEntity({ message: '工具名称无效，或模拟工具结果超过 12 KB。' })
    }
    if (payload.sourceConversationId) {
      const conversation = await AiChatConversation.query()
        .where('id', payload.sourceConversationId)
        .where('user_id', auth.getUserOrFail().id)
        .whereNull('api_key_id')
        .first()
      if (!conversation) return response.unprocessableEntity({ message: '引用的聊天会话不可用。' })
    }
    const evaluationCase = await AiEvaluationCase.findOrFail(id)
    const previousQuestion = evaluationCase.question
    const question = redactEvaluationText(payload.question)
    evaluationCase.merge({
      sourceConversationId: payload.sourceConversationId ?? null,
      name: payload.name,
      question,
      referenceAnswer: redactEvaluationText(payload.referenceAnswer),
      expectedTools: payload.expectedTools ?? [],
      expectedToolSequence: payload.expectedToolSequence ?? [],
      requiredTerms: payload.requiredTerms ?? [],
      forbiddenTerms: payload.forbiddenTerms ?? [],
      mockToolOutputs: sanitizeAiEvaluationMockOutputs(payload.mockToolOutputs ?? {}),
    })
    if (previousQuestion !== question) {
      evaluationCase.conversationMessages = []
    }
    await evaluationCase.save()
    return serialize(serializeCase(evaluationCase))
  }

  @ApiOperation({ summary: '删除测评条目' })
  @ApiResponse({
    status: 200,
    description: '测评条目已删除',
    schema: dataEnvelope({
      type: 'object',
      required: ['id', 'deleted'],
      properties: { id: { type: 'integer' }, deleted: { type: 'boolean', enum: [true] } },
    }),
  })
  @ApiResponse({ status: 404, description: '测评条目不存在', schema: errorResponseSchema })
  @ApiResponse({
    status: 409,
    description: '该测评条目正在运行，暂时不能删除',
    schema: errorResponseSchema,
  })
  async destroy({ request, response, serialize }: HttpContext) {
    const { id } = await idValidator.validate({ id: request.param('id') })
    const activeRuns = await AiEvaluationRun.query()
      .whereIn('status', ['queued', 'running'])
      .select('case_ids')
    if (activeRuns.some((run) => (run.caseIds ?? []).includes(id))) {
      return response.conflict({ message: '该测评条目正在运行，暂时不能删除。' })
    }
    const evaluationCase = await AiEvaluationCase.findOrFail(id)
    await evaluationCase.delete()
    return serialize({ id, deleted: true })
  }

  @ApiOperation({ summary: '将所选聊天消息加入测评管理' })
  @ApiBody({ type: () => aiEvaluationConversationImportValidator, required: true })
  @ApiResponse({
    status: 200,
    description: '已创建的测评条目',
    schema: dataEnvelope(evaluationCaseSchema),
  })
  @ApiResponse({ status: 404, description: '聊天会话不可用', schema: errorResponseSchema })
  @ApiResponse({ status: 422, description: '所选聊天消息无效', schema: errorResponseSchema })
  async importConversation({ request, auth, response, serialize }: HttpContext) {
    const payload = await aiEvaluationConversationImportValidator.validate(request.all())
    const messageIds = [...new Set(payload.messageIds)]
    if (messageIds.length !== payload.messageIds.length) {
      return response.unprocessableEntity({ message: '所选聊天消息不能重复。' })
    }

    const conversation = await AiChatConversation.query()
      .where('id', payload.conversationId)
      .where('user_id', auth.getUserOrFail().id)
      .whereNull('api_key_id')
      .first()
    if (!conversation) return response.notFound({ message: '聊天会话不可用。' })

    const messages = await AiChatMessage.query()
      .where('conversation_id', conversation.id)
      .whereIn('id', messageIds)
      .orderBy('id', 'asc')
    if (messages.length !== messageIds.length) {
      return response.unprocessableEntity({ message: '所选聊天消息不可用。' })
    }

    const conversationMessages = messages.map((message) => ({
      role: message.role,
      content: redactEvaluationText(message.content),
    }))
    const isCompleteDialogue =
      conversationMessages.every(
        ({ role, content }, index) =>
          Boolean(content.trim()) && role === (index % 2 === 0 ? 'user' : 'assistant')
      ) &&
      conversationMessages[0]?.role === 'user' &&
      conversationMessages.at(-1)?.role === 'assistant'
    if (!isCompleteDialogue) {
      return response.unprocessableEntity({
        message: '请选中完整的用户提问和助手回答，并按对话顺序选择。',
      })
    }

    const question = conversationMessages
      .filter((message) => message.role === 'user')
      .map((message) => message.content)
      .join('\n\n')
    const referenceAnswer = conversationMessages
      .filter((message) => message.role === 'assistant')
      .map((message) => message.content)
      .join('\n\n')
    if (question.length > 5_000 || referenceAnswer.length > 8_000) {
      return response.unprocessableEntity({ message: '所选聊天内容过长，请减少所选消息。' })
    }

    const existingCase = await AiEvaluationCase.query()
      .where('source_conversation_id', conversation.id)
      .whereRaw('source_message_ids = ?::jsonb', [JSON.stringify(messageIds)])
      .first()
    if (existingCase) return serialize(serializeCase(existingCase))

    const evaluationCase = await AiEvaluationCase.create({
      sourceConversationId: conversation.id,
      sourceMessageIds: messageIds,
      conversationMessages,
      name: redactEvaluationText(conversation.title).trim().slice(0, 200) || 'AI chat evaluation',
      question,
      referenceAnswer,
      expectedTools: [],
      expectedToolSequence: [],
      requiredTerms: [],
      forbiddenTerms: [],
      mockToolOutputs: {},
    })
    return serialize(serializeCase(evaluationCase))
  }

  @ApiOperation({ summary: '获取测评运行历史' })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1 } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
  })
  @ApiResponse({
    status: 200,
    description: '测评运行分页历史',
    schema: paginatedDataEnvelope(evaluationRunSchema),
  })
  async runsIndex({ request, serialize }: HttpContext) {
    const payload = await aiEvaluationRunListValidator.validate(request.qs())
    const paginator = await AiEvaluationRun.query()
      .orderBy('created_at', 'desc')
      .paginate(payload.page ?? 1, clampLimit(payload.limit, 10, 100))
    return serialize({ items: paginator.all().map(serializeRun), meta: paginator.getMeta() })
  }

  @ApiOperation({ summary: '获取单条测评的历史得分和回复' })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1 } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
  })
  @ApiResponse({
    status: 200,
    description: '单条测评的分页历史结果',
    schema: paginatedDataEnvelope({
      type: 'object',
      required: ['runId', 'modelId', 'status', 'createdAt', 'completedAt', 'result'],
      properties: {
        runId: { type: 'integer' },
        modelId: { type: 'string' },
        status: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        completedAt: { type: 'string', nullable: true, format: 'date-time' },
        result: { type: 'object', additionalProperties: true },
      },
    }),
  })
  async caseHistory({ request, serialize }: HttpContext) {
    const { id: caseId } = await idValidator.validate({ id: request.param('id') })
    const payload = await aiEvaluationRunListValidator.validate(request.qs())
    const paginator = await AiEvaluationRun.query()
      .whereRaw('results @> ?::jsonb', [JSON.stringify([{ caseId }])])
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .paginate(payload.page ?? 1, clampLimit(payload.limit, 20, 20))

    const items = paginator.all().flatMap((run) => {
      const result = (run.results ?? []).find((item) => item.caseId === caseId)
      if (!result) return []
      return [
        {
          runId: run.id,
          modelId: run.modelId,
          status: run.status,
          createdAt: run.createdAt.toISO() ?? '',
          completedAt: run.completedAt?.toISO() ?? null,
          result,
        },
      ]
    })
    return serialize({ items, meta: paginator.getMeta() })
  }

  @ApiOperation({ summary: '启动测评' })
  @ApiBody({ type: () => aiEvaluationRunValidator, required: true })
  @ApiResponse({
    status: 200,
    description: '测评任务已排队',
    schema: dataEnvelope(evaluationRunSchema),
  })
  @ApiResponse({ status: 409, description: '已有测评任务正在运行', schema: errorResponseSchema })
  @ApiResponse({ status: 422, description: '测评条目集合无效', schema: errorResponseSchema })
  async run({ request, auth, response, serialize }: HttpContext) {
    const payload = await aiEvaluationRunValidator.validate(request.all())
    const activeRun = await AiEvaluationRun.query().whereIn('status', ['queued', 'running']).first()
    if (activeRun) return response.conflict({ message: '已有测评任务正在运行。' })

    let cases: AiEvaluationCase[]
    if (payload.caseIds?.length) {
      const caseIds = [...new Set(payload.caseIds)]
      if (caseIds.length !== payload.caseIds.length) {
        return response.unprocessableEntity({ message: '测评条目不能重复。' })
      }
      cases = await AiEvaluationCase.query().whereIn('id', caseIds).orderBy('id', 'asc')
      if (cases.length !== caseIds.length) {
        return response.unprocessableEntity({ message: '包含不存在的测评条目。' })
      }
    } else {
      cases = await AiEvaluationCase.query().orderBy('id', 'asc').limit(101)
      if (cases.length > 100) {
        return response.unprocessableEntity({
          message: '单次最多运行 100 条，请先选择少于 100 条测评条目。',
        })
      }
    }
    if (!cases.length) return response.unprocessableEntity({ message: '请先添加测评条目。' })

    const model = await getAiAgentModelConfig()
    const run = await AiEvaluationRun.create({
      userId: auth.getUserOrFail().id,
      status: 'queued',
      modelId: model.modelId,
      caseIds: cases.map(({ id }) => id),
      totalCases: cases.length,
      completedCases: 0,
      score: null,
      results: [],
      error: null,
      startedAt: null,
      completedAt: null,
    })
    await queueAiEvaluationRun(run.id)
    return serialize(serializeRun(run))
  }

  @ApiOperation({ summary: '获取测评运行详情' })
  @ApiResponse({
    status: 200,
    description: '测评运行进度和对照评分',
    schema: dataEnvelope(evaluationRunSchema),
  })
  @ApiResponse({ status: 404, description: '测评运行不存在', schema: errorResponseSchema })
  async showRun({ request, serialize }: HttpContext) {
    const { id } = await idValidator.validate({ id: request.param('id') })
    const run = await AiEvaluationRun.findOrFail(id)
    return serialize(serializeRun(run))
  }
}
