import { Bouncer } from '@adonisjs/bouncer'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import {
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
} from '@foadonis/openapi/decorators'
import vine from '@vinejs/vine'
import { DateTime } from 'luxon'

import { access } from '#abilities/main'
import AiAutomation from '#models/ai_automation'
import AiAutomationRun from '#models/ai_automation_run'
import { getNextAiAutomationRunTimes } from '#services/ai_automation_schedule'
import {
  createAiAutomation,
  serializeAiAutomation,
  serializeAiAutomationRun,
  setAiAutomationEnabled,
  updateAiAutomation,
} from '#services/ai_automation_service'
import { clampLimit } from '#support/pagination'
import {
  aiAutomationEnabledValidator,
  aiAutomationListValidator,
  aiAutomationRunListValidator,
  aiAutomationSchedulePreviewValidator,
  aiAutomationUpdateValidator,
  aiAutomationValidator,
} from '#validators/ai_automation'

import {
  type ApiSchema,
  dataEnvelope,
  errorResponseSchema,
  paginatedDataEnvelope,
} from '../openapi/response_schemas.js'

const idValidator = vine.compile(vine.object({ id: vine.number().withoutDecimals().positive() }))

const automationSchema: ApiSchema = {
  type: 'object',
  required: [
    'id',
    'name',
    'prompt',
    'schedule',
    'nextRunAt',
    'enabled',
    'webhookConfigured',
    'webhookUrl',
    'webhookType',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    prompt: { type: 'string' },
    schedule: {
      type: 'object',
      required: ['kind', 'cron', 'at', 'time', 'weekday', 'timezone'],
      properties: {
        kind: { type: 'string', enum: ['once', 'cron'] },
        cron: { type: 'string', nullable: true },
        at: { type: 'string', nullable: true },
        time: { type: 'string', nullable: true },
        weekday: { type: 'integer', nullable: true },
        timezone: { type: 'string' },
      },
    },
    nextRunAt: { type: 'string', nullable: true, format: 'date-time' },
    enabled: { type: 'boolean' },
    webhookConfigured: { type: 'boolean' },
    webhookUrl: { type: 'string', nullable: true, format: 'uri' },
    webhookType: { type: 'string', enum: ['generic', 'wecom'] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
}

const automationRunSchema: ApiSchema = {
  type: 'object',
  required: [
    'id',
    'automationId',
    'automationName',
    'triggerKind',
    'status',
    'scheduledFor',
    'startedAt',
    'completedAt',
    'attemptCount',
    'summary',
    'error',
    'deliveryResults',
    'createdAt',
  ],
  properties: {
    id: { type: 'integer' },
    automationId: { type: 'integer' },
    automationName: { type: 'string' },
    triggerKind: { type: 'string', enum: ['scheduled', 'manual'] },
    status: { type: 'string' },
    scheduledFor: { type: 'string', format: 'date-time' },
    startedAt: { type: 'string', nullable: true, format: 'date-time' },
    completedAt: { type: 'string', nullable: true, format: 'date-time' },
    attemptCount: { type: 'integer' },
    summary: { type: 'string', nullable: true },
    error: { type: 'string', nullable: true },
    deliveryResults: { type: 'object', additionalProperties: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
}

const runPageSchema: ApiSchema = {
  type: 'object',
  required: ['items', 'meta'],
  properties: {
    items: { type: 'array', items: automationRunSchema },
    meta: {
      type: 'object',
      required: ['total', 'perPage', 'currentPage', 'lastPage'],
      properties: {
        total: { type: 'integer' },
        perPage: { type: 'integer' },
        currentPage: { type: 'integer' },
        lastPage: { type: 'integer' },
        firstPage: { type: 'integer' },
        firstPageUrl: { type: 'string', nullable: true },
        lastPageUrl: { type: 'string', nullable: true },
        nextPageUrl: { type: 'string', nullable: true },
        previousPageUrl: { type: 'string', nullable: true },
      },
    },
  },
}

@ApiSecurity('bearerAuth')
export default class AiAutomationsController {
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      required: ['cron'],
      properties: { cron: { type: 'string', minLength: 1, maxLength: 120 } },
    },
  })
  @ApiOperation({ summary: '预览 CRON 表达式的下三次执行时间' })
  @ApiResponse({
    status: 200,
    description: '按服务器当前时区计算的下三次执行时间',
    schema: dataEnvelope({
      type: 'object',
      required: ['times'],
      properties: { times: { type: 'array', items: { type: 'string' } } },
    }),
  })
  @ApiResponse({ status: 422, description: 'CRON 表达式无效', schema: errorResponseSchema })
  async preview({ request, response, serialize }: HttpContext) {
    const { cron } = await request.validateUsing(aiAutomationSchedulePreviewValidator)
    const timezone = DateTime.local().zoneName || 'UTC'
    try {
      return serialize({
        times: getNextAiAutomationRunTimes(cron, timezone).map((runAt) =>
          runAt.toFormat('yyyy-MM-dd HH:mm:ss')
        ),
      })
    } catch (error) {
      return response.unprocessableEntity({
        message: error instanceof Error ? error.message : 'CRON 表达式无效',
      })
    }
  }

  @ApiOperation({ summary: '获取当前用户的自动化任务' })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1 } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
  })
  @ApiResponse({
    status: 200,
    description: '分页自动化任务列表；管理权限可查看投递地址',
    schema: paginatedDataEnvelope({
      type: 'object',
      required: [
        'id',
        'name',
        'prompt',
        'schedule',
        'nextRunAt',
        'enabled',
        'webhookConfigured',
        'webhookUrl',
        'webhookType',
        'createdAt',
        'updatedAt',
        'latestRun',
      ],
      properties: {
        ...automationSchema.properties,
        latestRun: {
          type: 'object',
          nullable: true,
          required: ['id', 'status', 'createdAt'],
          properties: {
            id: { type: 'integer' },
            status: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    }),
  })
  @ApiQuery({ name: 'name', required: false, schema: { type: 'string', maxLength: 120 } })
  @ApiQuery({ name: 'schedule', required: false, schema: { type: 'string', maxLength: 120 } })
  async index({ request, auth, serialize }: HttpContext) {
    const payload = await aiAutomationListValidator.validate(request.qs())
    const user = auth.getUserOrFail()
    const bouncer = new Bouncer(() => user, { access })
    const canManage = await bouncer.allows('access', 'ai-automations:manage')
    const query = AiAutomation.query().where('user_id', user.id).whereNull('deleted_at')
    if (payload.name) query.whereILike('name', `%${payload.name}%`)
    if (payload.schedule) query.whereILike('schedule_cron', `%${payload.schedule}%`)
    const paginator = await query
      .orderBy('updated_at', 'desc')
      .paginate(payload.page ?? 1, clampLimit(payload.limit, 20, 100))
    const automations = paginator.all()
    const latestRuns = automations.length
      ? await db
          .from('ai_automation_runs')
          .distinctOn('automation_id')
          .select('id', 'automation_id', 'status', 'created_at')
          .where('user_id', user.id)
          .whereIn(
            'automation_id',
            automations.map(({ id }) => id)
          )
          .orderBy('automation_id')
          .orderBy('created_at', 'desc')
          .orderBy('id', 'desc')
      : []
    const latestRunByAutomationId = new Map(
      latestRuns.map((run) => [run.automation_id as number, run])
    )
    return serialize({
      items: automations.map((automation) => ({
        ...serializeAiAutomation(automation, canManage),
        latestRun: latestRunByAutomationId.has(automation.id)
          ? {
              id: latestRunByAutomationId.get(automation.id)!.id,
              status: latestRunByAutomationId.get(automation.id)!.status,
              createdAt: latestRunByAutomationId.get(automation.id)!.created_at,
            }
          : null,
      })),
      meta: paginator.getMeta(),
    })
  }

  @ApiOperation({ summary: '创建自动化任务' })
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      required: ['name', 'prompt', 'schedule', 'webhookUrl'],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 120 },
        prompt: { type: 'string', minLength: 1, maxLength: 8_000 },
        schedule: {
          type: 'object',
          required: ['cron'],
          properties: { cron: { type: 'string', minLength: 1, maxLength: 120 } },
        },
        webhookType: { type: 'string', enum: ['generic', 'wecom'], default: 'generic' },
        webhookUrl: { type: 'string', format: 'uri', maxLength: 2_048 },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '已创建自动化任务',
    schema: dataEnvelope(automationSchema),
  })
  @ApiResponse({ status: 422, description: '计划或 Webhook 配置无效', schema: errorResponseSchema })
  async store({ request, auth, response, serialize }: HttpContext) {
    const payload = await request.validateUsing(aiAutomationValidator)
    try {
      const automation = await createAiAutomation(auth.getUserOrFail().id, payload)
      return serialize(serializeAiAutomation(automation, true))
    } catch (error) {
      return response.unprocessableEntity({
        message: error instanceof Error ? error.message : '自动化任务无效',
      })
    }
  }

  @ApiOperation({ summary: '获取自动化任务和运行历史' })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1 } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 50 },
  })
  @ApiResponse({
    status: 200,
    description: '自动化任务和分页运行记录；管理权限可查看投递地址',
    schema: dataEnvelope({
      type: 'object',
      required: ['automation', 'runs'],
      properties: {
        automation: automationSchema,
        runs: runPageSchema,
      },
    }),
  })
  @ApiResponse({ status: 404, description: '自动化任务不存在', schema: errorResponseSchema })
  async show({ request, auth, response, serialize }: HttpContext) {
    const { id } = await idValidator.validate({ id: request.param('id') })
    const query = await aiAutomationRunListValidator.validate(request.qs())
    const user = auth.getUserOrFail()
    const bouncer = new Bouncer(() => user, { access })
    const canManage = await bouncer.allows('access', 'ai-automations:manage')
    const automation = await AiAutomation.query()
      .where('id', id)
      .where('user_id', user.id)
      .whereNull('deleted_at')
      .first()
    if (!automation) return response.notFound()
    const paginator = await AiAutomationRun.query()
      .where('automation_id', automation.id)
      .where('user_id', user.id)
      .orderBy('created_at', 'desc')
      .paginate(query.page ?? 1, clampLimit(query.limit, 20, 50))
    return serialize({
      automation: serializeAiAutomation(automation, canManage),
      runs: {
        items: paginator.all().map(serializeAiAutomationRun),
        meta: paginator.getMeta(),
      },
    })
  }

  @ApiOperation({ summary: '更新自动化任务' })
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      required: ['name', 'prompt', 'schedule', 'enabled'],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 120 },
        prompt: { type: 'string', minLength: 1, maxLength: 8_000 },
        schedule: {
          type: 'object',
          required: ['cron'],
          properties: { cron: { type: 'string', minLength: 1, maxLength: 120 } },
        },
        webhookType: { type: 'string', enum: ['generic', 'wecom'] },
        webhookUrl: { type: 'string', format: 'uri', maxLength: 2_048 },
        enabled: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '已更新自动化任务',
    schema: dataEnvelope(automationSchema),
  })
  @ApiResponse({ status: 404, description: '自动化任务不存在', schema: errorResponseSchema })
  @ApiResponse({ status: 422, description: '计划或 Webhook 配置无效', schema: errorResponseSchema })
  async update({ request, auth, response, serialize }: HttpContext) {
    const { id } = await idValidator.validate({ id: request.param('id') })
    const payload = await request.validateUsing(aiAutomationUpdateValidator)
    let automation: AiAutomation | null = null
    try {
      automation = await db.transaction(async (trx) => {
        const record = await AiAutomation.query({ client: trx })
          .where('id', id)
          .where('user_id', auth.getUserOrFail().id)
          .whereNull('deleted_at')
          .forUpdate()
          .first()
        if (!record) return null
        await updateAiAutomation(record, payload)
        if (!record.enabled) {
          const queuedRuns = await AiAutomationRun.query({ client: trx })
            .where('automation_id', id)
            .where('trigger_kind', 'scheduled')
            .where('status', 'queued')
            .forUpdate()
          if (queuedRuns.length) {
            await trx
              .from('ai_automation_runs')
              .whereIn(
                'id',
                queuedRuns.map(({ id: runId }) => runId)
              )
              .update({
                status: 'cancelled',
                completed_at: DateTime.now().toJSDate(),
                updated_at: DateTime.now().toJSDate(),
                error: '任务已暂停',
              })
          }
        }
        return record
      })
    } catch (error) {
      return response.unprocessableEntity({
        message: error instanceof Error ? error.message : '自动化任务无效',
      })
    }
    if (!automation) return response.notFound()
    return serialize(serializeAiAutomation(automation, true))
  }

  @ApiOperation({ summary: '暂停或恢复自动化任务' })
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      required: ['enabled'],
      properties: { enabled: { type: 'boolean' } },
    },
  })
  @ApiResponse({
    status: 200,
    description: '自动化任务状态已更新',
    schema: dataEnvelope(automationSchema),
  })
  @ApiResponse({ status: 404, description: '自动化任务不存在', schema: errorResponseSchema })
  @ApiResponse({ status: 422, description: '计划无效', schema: errorResponseSchema })
  async setEnabled({ request, auth, response, serialize }: HttpContext) {
    const { id } = await idValidator.validate({ id: request.param('id') })
    const payload = await request.validateUsing(aiAutomationEnabledValidator)
    const result = await db.transaction(async (trx) => {
      const automation = await AiAutomation.query({ client: trx })
        .where('id', id)
        .where('user_id', auth.getUserOrFail().id)
        .whereNull('deleted_at')
        .forUpdate()
        .first()
      if (!automation) return { kind: 'missing' as const }
      try {
        await setAiAutomationEnabled(automation, payload.enabled)
      } catch (error) {
        return {
          kind: 'invalid' as const,
          message: error instanceof Error ? error.message : '自动化任务无效',
        }
      }
      if (!payload.enabled) {
        const queuedRuns = await AiAutomationRun.query({ client: trx })
          .where('automation_id', id)
          .where('trigger_kind', 'scheduled')
          .where('status', 'queued')
          .forUpdate()
        if (queuedRuns.length) {
          const now = DateTime.now()
          await trx
            .from('ai_automation_runs')
            .whereIn(
              'id',
              queuedRuns.map(({ id: runId }) => runId)
            )
            .update({
              status: 'cancelled',
              completed_at: now.toJSDate(),
              updated_at: now.toJSDate(),
              error: '任务已暂停',
            })
        }
      }
      return { kind: 'updated' as const, automation }
    })
    if (result.kind === 'missing') return response.notFound()
    if (result.kind === 'invalid') return response.unprocessableEntity({ message: result.message })
    return serialize(serializeAiAutomation(result.automation, true))
  }

  @ApiOperation({ summary: '删除自动化任务' })
  @ApiResponse({
    status: 200,
    description: '自动化任务已删除',
    schema: dataEnvelope({
      type: 'object',
      required: ['id', 'deleted'],
      properties: { id: { type: 'integer' }, deleted: { type: 'boolean', enum: [true] } },
    }),
  })
  @ApiResponse({ status: 404, description: '自动化任务不存在', schema: errorResponseSchema })
  @ApiResponse({ status: 409, description: '自动化任务仍在运行', schema: errorResponseSchema })
  async destroy({ request, auth, response, serialize }: HttpContext) {
    const { id } = await idValidator.validate({ id: request.param('id') })
    const result = await db.transaction(async (trx) => {
      const automation = await AiAutomation.query({ client: trx })
        .where('id', id)
        .where('user_id', auth.getUserOrFail().id)
        .whereNull('deleted_at')
        .forUpdate()
        .first()
      if (!automation) return 'missing'
      const activeRuns = await AiAutomationRun.query({ client: trx })
        .where('automation_id', id)
        .whereIn('status', ['queued', 'running'])
        .forUpdate()
      if (activeRuns.some((run) => run.status === 'running')) return 'running'
      const now = DateTime.now()
      automation.enabled = false
      automation.nextRunAt = null
      automation.deletedAt = now
      await automation.save()
      if (activeRuns.length) {
        await trx
          .from('ai_automation_runs')
          .whereIn(
            'id',
            activeRuns.map(({ id: runId }) => runId)
          )
          .where('status', 'queued')
          .update({
            status: 'cancelled',
            completed_at: now.toJSDate(),
            updated_at: now.toJSDate(),
            error: '任务已删除',
          })
      }
      return 'deleted'
    })
    if (result === 'missing') return response.notFound()
    if (result === 'running')
      return response.conflict({ message: '任务正在运行，请完成后再删除。' })
    return serialize({ id, deleted: true })
  }

  @ApiOperation({ summary: '立即运行自动化任务' })
  @ApiResponse({
    status: 200,
    description: '自动化运行已排队',
    schema: dataEnvelope(automationRunSchema),
  })
  @ApiResponse({ status: 404, description: '自动化任务不存在', schema: errorResponseSchema })
  @ApiResponse({ status: 409, description: '已有运行正在排队或执行', schema: errorResponseSchema })
  async runNow({ request, auth, response, serialize }: HttpContext) {
    const { id } = await idValidator.validate({ id: request.param('id') })
    const user = auth.getUserOrFail()
    const result = await db.transaction(async (trx) => {
      const automation = await AiAutomation.query({ client: trx })
        .where('id', id)
        .where('user_id', user.id)
        .whereNull('deleted_at')
        .forUpdate()
        .first()
      if (!automation) return { kind: 'missing' as const }
      const activeRun = await AiAutomationRun.query({ client: trx })
        .where('automation_id', id)
        .whereIn('status', ['queued', 'running'])
        .forUpdate()
        .first()
      if (activeRun) return { kind: 'active' as const }
      const run = await AiAutomationRun.create(
        {
          automationId: automation.id,
          userId: user.id,
          automationName: automation.name,
          triggerKind: 'manual',
          status: 'queued',
          scheduledFor: DateTime.now(),
          attemptCount: 0,
          summary: null,
          error: null,
          deliveryResults: {},
        },
        { client: trx }
      )
      return { kind: 'queued' as const, run }
    })
    if (result.kind === 'missing') return response.notFound()
    if (result.kind === 'active')
      return response.conflict({ message: '该任务已有运行正在排队或执行。' })
    return serialize(serializeAiAutomationRun(result.run))
  }
}
