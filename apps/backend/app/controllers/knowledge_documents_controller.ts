import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { Bouncer } from '@adonisjs/bouncer'
import type { HttpContext } from '@adonisjs/core/http'
import {
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
} from '@foadonis/openapi/decorators'

import { access } from '#abilities/main'
import KnowledgeDocument from '#models/knowledge_document'
import Role from '#models/role'
import { recordAuditEvent } from '#services/audit_log'
import { suggestKnowledgeMetadata } from '#services/knowledge_metadata_service'
import {
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  indexKnowledgeDocument,
} from '#services/knowledge_service'
import { clampLimit } from '#support/pagination'
import { serializeKnowledgeDocument } from '#transformers/knowledge_document_transformer'
import {
  knowledgeDocumentListValidator,
  knowledgeDocumentRoleIdsValidator,
  knowledgeDocumentValidator,
  knowledgeMetadataPreviewValidator,
} from '#validators/knowledge_document'

import {
  type ApiSchema,
  dataEnvelope,
  errorResponseSchema,
  paginatedDataEnvelope,
} from '../openapi/response_schemas.js'

const knowledgeDocumentSchema: ApiSchema = {
  type: 'object',
  required: [
    'id',
    'title',
    'content',
    'enabled',
    'topics',
    'contentHash',
    'chunkCount',
    'roles',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'integer' },
    title: { type: 'string' },
    content: { type: 'string' },
    enabled: { type: 'boolean' },
    summary: { type: 'string', nullable: true },
    topics: { type: 'array', items: { type: 'string' } },
    contentHash: { type: 'string' },
    chunkCount: { type: 'integer' },
    roles: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'code', 'name'],
        properties: { id: { type: 'integer' }, code: { type: 'string' }, name: { type: 'string' } },
      },
    },
    createdAt: { type: 'string', nullable: true, format: 'date-time' },
    updatedAt: { type: 'string', nullable: true, format: 'date-time' },
  },
}

const knowledgeFormFields = {
  summary: { type: 'string', maxLength: 2_000 },
  topics: { type: 'string', description: 'JSON 编码的主题字符串数组，最多 20 项。' },
  enabled: { type: 'boolean' },
  roleIds: { type: 'string', description: 'JSON 编码的角色 ID 数组，最多 100 项。' },
} as const

function parseRoleIds(value: unknown) {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      throw new Error('角色选择无效')
    }
  }
  if (!Array.isArray(parsed)) throw new Error('角色选择无效')
  return parsed
}

async function validateRoleIds(roleIds: number[]) {
  const uniqueRoleIds = [...new Set(roleIds)]
  const roles = await Role.query().whereIn('id', uniqueRoleIds)
  if (roles.length !== uniqueRoleIds.length) throw new Error('包含不存在的角色')
  return uniqueRoleIds
}

function parseEnabled(value: unknown, defaultValue: boolean) {
  if (value === undefined || value === null || value === '') return defaultValue
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  throw new Error('启用状态无效')
}

async function readTextFile(ctx: HttpContext, required: boolean) {
  const file = ctx.request.file('file', {
    size: '5mb',
    extnames: ['txt', 'md', 'markdown', 'rst'],
  })
  if (!file && !required) return null
  if (!file || !file.isValid || !file.tmpPath) {
    throw new Error('请上传不超过 5MB 的 UTF-8 纯文本文件')
  }
  const rawContent = await readFile(file.tmpPath, 'utf8')
  const content = rawContent.replace(/^\uFEFF/, '').trim()
  if (!content || content.includes('\0')) throw new Error('文本文件内容无效')
  return { title: path.parse(file.clientName).name.slice(0, 200), content }
}

function parseTopics(value: unknown) {
  if (value === undefined || value === null || value === '') return []
  const parsed = typeof value === 'string' ? JSON.parse(value) : value
  if (!Array.isArray(parsed)) throw new Error('可检索主题格式无效')
  return parsed
}

async function readTextFiles(ctx: HttpContext) {
  const files = ctx.request.files('files', {
    size: '5mb',
    extnames: ['txt', 'md', 'markdown', 'rst'],
  })
  if (!files.length) throw new Error('请至少上传一份纯文本文件')
  if (files.length > 20) throw new Error('一次最多上传 20 份纯文本文件')

  return Promise.all(
    files.map(async (file) => {
      if (!file.isValid || !file.tmpPath) {
        throw new Error(`文件「${file.clientName}」无效，请上传不超过 5MB 的 UTF-8 纯文本文件`)
      }
      const rawContent = await readFile(file.tmpPath, 'utf8')
      const content = rawContent.replace(/^\uFEFF/, '').trim()
      if (!content || content.includes('\0')) {
        throw new Error(`文件「${file.clientName}」内容无效`)
      }
      return { title: path.parse(file.clientName).name.slice(0, 200), content }
    })
  )
}

@ApiSecurity('bearerAuth')
export default class KnowledgeDocumentsController {
  @ApiOperation({
    summary: '获取知识文档列表',
    description: '返回当前用户按角色可见的知识文档分页列表，标题、摘要和正文分别筛选。',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: '页码，从 1 开始',
    schema: { type: 'integer', minimum: 1 },
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: '每页数量，默认 20，最大 100',
    schema: { type: 'integer', minimum: 1 },
  })
  @ApiQuery({ name: 'title', required: false, schema: { type: 'string', maxLength: 200 } })
  @ApiQuery({ name: 'summary', required: false, schema: { type: 'string', maxLength: 2_000 } })
  @ApiQuery({ name: 'content', required: false, schema: { type: 'string', maxLength: 200 } })
  @ApiResponse({
    status: 200,
    description: '按角色可见并包含角色范围的知识文档分页列表',
    schema: paginatedDataEnvelope(knowledgeDocumentSchema),
  })
  async index({ auth, request, serialize }: HttpContext) {
    const payload = await knowledgeDocumentListValidator.validate(request.qs())
    const user = auth.getUserOrFail()
    const bouncer = new Bouncer(() => user, { access })
    const canManage = await bouncer.allows('access', 'knowledge:manage')
    const roles = await user.related('roles').query()
    const query = KnowledgeDocument.query()
      .preload('roles')
      .withCount('chunks')
      .orderBy('updated_at', 'desc')
    if (!canManage) {
      const roleIds = roles.map((role) => role.id)
      query.where((builder) => {
        builder
          .whereDoesntHave('roles', () => undefined)
          .orWhereHas('roles', (roleQuery) => roleQuery.whereIn('roles.id', roleIds))
      })
    }
    if (payload.title) query.whereILike('title', `%${payload.title}%`)
    if (payload.summary) query.whereILike('summary', `%${payload.summary}%`)
    if (payload.content) query.whereILike('content', `%${payload.content}%`)
    const paginator = await query.paginate(payload.page ?? 1, clampLimit(payload.limit, 20, 100))
    return serialize({
      items: paginator.all().map(serializeKnowledgeDocument),
      meta: paginator.getMeta(),
    })
  }

  @ApiOperation({ summary: '生成知识文档目录元数据建议' })
  @ApiBody({
    mediaType: 'multipart/form-data',
    required: true,
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: '最大 5 MB 的 UTF-8 纯文本文件。' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'LLM 提取的待确认元数据建议',
    schema: dataEnvelope({
      type: 'object',
      required: ['summary', 'topics'],
      properties: {
        summary: { type: 'string', nullable: true, maxLength: 2_000 },
        topics: {
          type: 'array',
          maxItems: 20,
          items: { type: 'string', minLength: 1, maxLength: 80 },
        },
      },
    }),
  })
  @ApiResponse({
    status: 422,
    description: '文本文件无效或元数据提取失败',
    schema: errorResponseSchema,
  })
  async metadataPreview(ctx: HttpContext) {
    const { response, serialize } = ctx
    const textFile = await readTextFile(ctx, true)
    const payload = await knowledgeMetadataPreviewValidator.validate({
      title: textFile!.title,
      content: textFile!.content,
    })
    try {
      return serialize(await suggestKnowledgeMetadata(payload))
    } catch (error) {
      return response.unprocessableEntity({
        message: error instanceof Error ? error.message : '知识文档元数据提取失败',
      })
    }
  }

  @ApiOperation({ summary: '创建并索引知识文档' })
  @ApiBody({
    mediaType: 'multipart/form-data',
    required: true,
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: '最大 5 MB 的 UTF-8 纯文本文件；文件名生成标题。',
        },
        ...knowledgeFormFields,
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '已创建的知识文档',
    schema: dataEnvelope(knowledgeDocumentSchema),
  })
  @ApiResponse({
    status: 422,
    description: '文件、元数据或角色选择无效',
    schema: errorResponseSchema,
  })
  async store(ctx: HttpContext) {
    const { auth, request, response, serialize } = ctx
    const textFile = await readTextFile(ctx, true)
    try {
      const payload = await knowledgeDocumentValidator.validate({
        title: textFile!.title,
        content: textFile!.content,
        summary: request.input('summary') || null,
        topics: parseTopics(request.input('topics', '[]')),
        enabled: parseEnabled(request.input('enabled'), true),
        roleIds: parseRoleIds(request.input('roleIds', '[]')),
      })
      payload.roleIds = await validateRoleIds(payload.roleIds ?? [])
      const document = await createKnowledgeDocument(payload)
      await document.load('roles')
      await recordAuditEvent(ctx, {
        actorUserId: auth.getUserOrFail().id,
        action: 'knowledge_document.created',
        targetType: 'knowledge_document',
        targetId: document.id,
        metadata: {
          title: document.title,
          enabled: document.enabled,
          roleIds: payload.roleIds,
        },
      })
      return serialize(serializeKnowledgeDocument(document))
    } catch (error) {
      if (
        error instanceof Error &&
        /启用状态|角色选择|不存在的角色|上传|文本文件|主题|元数据/.test(error.message)
      ) {
        return response.unprocessableEntity({ message: error.message })
      }
      throw error
    }
  }

  @ApiOperation({ summary: '批量创建并索引知识文档' })
  @ApiBody({
    mediaType: 'multipart/form-data',
    required: true,
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: {
          type: 'array',
          maxItems: 20,
          items: {
            type: 'string',
            format: 'binary',
            description: '每份最大 5 MB；支持 txt、md、markdown、rst。',
          },
        },
        enabled: knowledgeFormFields.enabled,
        roleIds: knowledgeFormFields.roleIds,
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '批量创建结果，包含成功和失败文件',
    schema: dataEnvelope({
      type: 'object',
      required: ['items', 'failed'],
      properties: {
        items: { type: 'array', items: knowledgeDocumentSchema },
        failed: {
          type: 'array',
          items: {
            type: 'object',
            required: ['fileName', 'message'],
            properties: { fileName: { type: 'string' }, message: { type: 'string' } },
          },
        },
      },
    }),
  })
  @ApiResponse({
    status: 422,
    description: '未成功创建任何文档或批量字段无效',
    schema: errorResponseSchema,
  })
  async storeBatch(ctx: HttpContext) {
    const { request, response, serialize } = ctx
    try {
      const textFiles = await readTextFiles(ctx)
      const actorUserId = ctx.auth.getUserOrFail().id
      const enabled = parseEnabled(request.input('enabled'), true)
      const { roleIds: requestedRoleIds } = await knowledgeDocumentRoleIdsValidator.validate({
        roleIds: parseRoleIds(request.input('roleIds', '[]')),
      })
      const roleIds = await validateRoleIds(requestedRoleIds)
      const created: KnowledgeDocument[] = []
      const failed: Array<{ fileName: string; message: string }> = []

      for (const textFile of textFiles) {
        try {
          created.push(
            await createKnowledgeDocument({
              title: textFile.title,
              content: textFile.content,
              enabled,
              roleIds,
            })
          )
        } catch (error) {
          failed.push({
            fileName: `${textFile.title}`,
            message: error instanceof Error ? error.message : '文件处理失败',
          })
        }
      }

      if (!created.length) {
        return response.unprocessableEntity({
          message: failed.map((item) => `${item.fileName}: ${item.message}`).join('；'),
        })
      }

      for (const document of created) {
        await recordAuditEvent(ctx, {
          actorUserId,
          action: 'knowledge_document.created',
          targetType: 'knowledge_document',
          targetId: document.id,
          metadata: {
            title: document.title,
            enabled: document.enabled,
            roleIds,
            batch: true,
          },
        })
      }

      const documents = await KnowledgeDocument.query()
        .whereIn(
          'id',
          created.map((document) => document.id)
        )
        .preload('roles')
        .withCount('chunks')
        .orderBy('created_at', 'asc')

      return serialize({
        items: documents.map(serializeKnowledgeDocument),
        failed,
      })
    } catch (error) {
      if (
        error instanceof Error &&
        /启用状态|角色选择|不存在的角色|上传|文件|纯文本/.test(error.message)
      ) {
        return response.unprocessableEntity({ message: error.message })
      }
      throw error
    }
  }

  @ApiOperation({ summary: '更新并重新索引知识文档' })
  @ApiBody({
    mediaType: 'multipart/form-data',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: '可选，最大 5 MB 的 UTF-8 纯文本文件。',
        },
        ...knowledgeFormFields,
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '已更新的知识文档',
    schema: dataEnvelope(knowledgeDocumentSchema),
  })
  @ApiResponse({ status: 404, description: '知识文档不存在', schema: errorResponseSchema })
  @ApiResponse({
    status: 422,
    description: '文件、元数据或角色选择无效',
    schema: errorResponseSchema,
  })
  async update(ctx: HttpContext) {
    const { auth, params, request, response, serialize } = ctx
    const document = await KnowledgeDocument.findOrFail(params.id)
    await document.load('roles')
    const previousRoleIds = document.roles.map((role) => role.id).sort((a, b) => a - b)
    const textFile = await readTextFile(ctx, false)
    try {
      const payload = await knowledgeDocumentValidator.validate({
        title: textFile?.title ?? document.title,
        content: textFile?.content ?? document.content,
        summary: request.input('summary') || null,
        topics: parseTopics(request.input('topics', JSON.stringify(document.topics ?? []))),
        enabled: parseEnabled(request.input('enabled'), document.enabled),
        roleIds: parseRoleIds(request.input('roleIds', JSON.stringify(previousRoleIds))),
      })
      payload.roleIds = await validateRoleIds(payload.roleIds ?? [])
      const nextRoleIds = [...(payload.roleIds ?? [])].sort((a, b) => a - b)
      const shouldReindex =
        document.title !== payload.title ||
        document.content !== payload.content ||
        document.summary !== (payload.summary ?? null) ||
        JSON.stringify(document.topics ?? []) !== JSON.stringify(payload.topics ?? [])
      const changedFields = [
        document.title !== payload.title ? 'title' : null,
        document.content !== payload.content ? 'content' : null,
        document.summary !== (payload.summary ?? null) ? 'summary' : null,
        JSON.stringify(document.topics ?? []) !== JSON.stringify(payload.topics ?? [])
          ? 'topics'
          : null,
        document.enabled !== (payload.enabled ?? document.enabled) ? 'enabled' : null,
        JSON.stringify(previousRoleIds) !== JSON.stringify(nextRoleIds) ? 'roles' : null,
      ].filter((field): field is string => field !== null)
      document.merge({
        title: payload.title,
        content: payload.content,
        summary: payload.summary ?? null,
        topics: payload.topics ?? [],
        enabled: payload.enabled ?? document.enabled,
      })
      if (shouldReindex) {
        await indexKnowledgeDocument(document)
      } else {
        await document.save()
      }
      await document.related('roles').sync(payload.roleIds ?? [])
      await document.load('roles')
      await recordAuditEvent(ctx, {
        actorUserId: auth.getUserOrFail().id,
        action: 'knowledge_document.updated',
        targetType: 'knowledge_document',
        targetId: document.id,
        metadata: {
          title: document.title,
          changedFields,
          reindexed: shouldReindex,
          enabled: document.enabled,
          roleIds: nextRoleIds,
        },
      })
      return serialize(serializeKnowledgeDocument(document))
    } catch (error) {
      if (
        error instanceof Error &&
        /启用状态|角色选择|不存在的角色|上传|文本文件/.test(error.message)
      ) {
        return response.unprocessableEntity({ message: error.message })
      }
      throw error
    }
  }

  @ApiOperation({ summary: '使用当前内容重建知识文档向量索引' })
  @ApiResponse({
    status: 200,
    description: '已重新索引的知识文档',
    schema: dataEnvelope(knowledgeDocumentSchema),
  })
  @ApiResponse({ status: 404, description: '知识文档不存在', schema: errorResponseSchema })
  async reindex(ctx: HttpContext) {
    const { auth, params, serialize } = ctx
    const document = await KnowledgeDocument.findOrFail(params.id)
    await indexKnowledgeDocument(document)
    const indexedDocument = await KnowledgeDocument.query()
      .where('id', document.id)
      .preload('roles')
      .withCount('chunks')
      .firstOrFail()
    await recordAuditEvent(ctx, {
      actorUserId: auth.getUserOrFail().id,
      action: 'knowledge_document.reindexed',
      targetType: 'knowledge_document',
      targetId: document.id,
      metadata: { title: document.title },
    })
    return serialize(serializeKnowledgeDocument(indexedDocument))
  }

  @ApiOperation({ summary: '删除知识文档' })
  @ApiResponse({
    status: 200,
    description: '知识文档已删除',
    schema: dataEnvelope({
      type: 'object',
      required: ['id', 'deleted'],
      properties: { id: { type: 'integer' }, deleted: { type: 'boolean', enum: [true] } },
    }),
  })
  @ApiResponse({ status: 404, description: '知识文档不存在', schema: errorResponseSchema })
  async destroy(ctx: HttpContext) {
    const { auth, params, serialize } = ctx
    const document = await KnowledgeDocument.findOrFail(params.id)
    const title = document.title
    await deleteKnowledgeDocument(document)
    await recordAuditEvent(ctx, {
      actorUserId: auth.getUserOrFail().id,
      action: 'knowledge_document.deleted',
      targetType: 'knowledge_document',
      targetId: document.id,
      metadata: { title },
    })
    return serialize({ id: document.id, deleted: true })
  }
}
