import type { HttpContext } from '@adonisjs/core/http'
import {
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
} from '@foadonis/openapi/decorators'

import ApiKey from '#models/api_key'
import {
  createApiKey,
  revokeOrDeleteApiKey,
  serializeApiKey,
  updateApiKey,
} from '#services/api_key_service'
import { clampLimit } from '#support/pagination'
import { apiKeyListValidator, apiKeyValidator, updateApiKeyValidator } from '#validators/api_key'

import {
  type ApiSchema,
  dataEnvelope,
  errorResponseSchema,
  paginationMetaSchema,
} from '../openapi/response_schemas.js'

const apiKeySchema: ApiSchema = {
  type: 'object',
  required: ['id', 'name', 'prefix', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    prefix: { type: 'string' },
    lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
    expiresAt: { type: 'string', format: 'date-time', nullable: true },
    revokedAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
}

@ApiSecurity('bearerAuth')
export default class ApiKeysController {
  @ApiOperation({
    summary: '获取 API Key 列表',
    description:
      '返回可供助手集成和网页嵌入使用的 API Key 分页列表。名称和公开前缀分别筛选；不暴露原始密钥。',
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
  @ApiQuery({ name: 'name', required: false, schema: { type: 'string', maxLength: 120 } })
  @ApiQuery({ name: 'prefix', required: false, schema: { type: 'string', maxLength: 32 } })
  @ApiResponse({
    status: 200,
    description: 'API Key 分页列表，不包含原始密钥',
    schema: dataEnvelope({
      type: 'object',
      required: ['items', 'meta'],
      properties: {
        items: { type: 'array', items: apiKeySchema },
        meta: paginationMetaSchema,
      },
    }),
  })
  @ApiResponse({ status: 422, description: '查询参数无效', schema: errorResponseSchema })
  async index({ request, serialize }: HttpContext) {
    const payload = await apiKeyListValidator.validate(request.qs())
    const page = payload.page ?? 1
    const query = ApiKey.query().orderBy('created_at', 'desc')
    if (payload.name) query.whereILike('name', `%${payload.name}%`)
    if (payload.prefix) query.whereILike('prefix', `%${payload.prefix}%`)
    const paginator = await query.paginate(page, clampLimit(payload.limit, 20, 100))
    return serialize({
      items: paginator.all().map((key) => serializeApiKey(key)),
      meta: paginator.getMeta(),
    })
  }

  @ApiOperation({
    summary: '创建 API Key',
    description: '创建 API Key，供服务器集成或网页嵌入使用；原始密钥只在创建响应中完整返回一次。',
  })
  @ApiBody({ type: () => apiKeyValidator, required: true })
  @ApiResponse({
    status: 200,
    description: '已创建的 API Key 和仅披露一次的原始密钥',
    schema: dataEnvelope({
      type: 'object',
      required: ['id', 'name', 'prefix', 'createdAt', 'updatedAt', 'key'],
      properties: {
        ...apiKeySchema.properties,
        key: { type: 'string', description: '完整密钥仅在创建响应中返回一次' },
      },
    }),
  })
  @ApiResponse({ status: 422, description: 'API Key 字段无效', schema: errorResponseSchema })
  async store(ctx: HttpContext) {
    const { auth, request, serialize } = ctx
    const payload = await request.validateUsing(apiKeyValidator)
    const created = await createApiKey(ctx, auth.getUserOrFail().id, payload, 'api')

    return serialize({
      ...serializeApiKey(created.apiKey),
      key: created.secret,
    })
  }

  @ApiOperation({
    summary: '更新 API Key',
    description: '更新 API Key 的名称和有效期，不会重新生成密钥。',
  })
  @ApiBody({ type: () => updateApiKeyValidator, required: true })
  @ApiResponse({ status: 200, description: '已更新的 API Key', schema: dataEnvelope(apiKeySchema) })
  @ApiResponse({ status: 404, description: 'API Key 不存在', schema: errorResponseSchema })
  @ApiResponse({ status: 422, description: 'API Key 字段无效', schema: errorResponseSchema })
  async update(ctx: HttpContext) {
    const { auth, params, request, serialize } = ctx
    const payload = await request.validateUsing(updateApiKeyValidator)
    const apiKey = await updateApiKey(ctx, {
      actorUserId: auth.getUserOrFail().id,
      apiKeyId: params.id,
      payload,
      source: 'api',
    })

    return serialize(serializeApiKey(apiKey))
  }

  @ApiOperation({
    summary: '吊销或删除 API Key',
    description: '首次删除会吊销 API Key；对已吊销的 API Key 再次删除会物理删除记录。',
  })
  @ApiResponse({
    status: 200,
    description: '吊销后的 API Key 或物理删除结果',
    schema: dataEnvelope({
      oneOf: [
        apiKeySchema,
        {
          type: 'object',
          required: ['id', 'deleted'],
          properties: { id: { type: 'integer' }, deleted: { type: 'boolean', enum: [true] } },
        },
      ],
    }),
  })
  @ApiResponse({ status: 404, description: 'API Key 不存在', schema: errorResponseSchema })
  async destroy(ctx: HttpContext) {
    const { auth, params, serialize } = ctx
    const result = await revokeOrDeleteApiKey(ctx, {
      actorUserId: auth.getUserOrFail().id,
      apiKeyId: params.id,
      source: 'api',
    })
    if (result.deleted) return serialize({ id: result.id, deleted: true })

    return serialize(serializeApiKey(result.apiKey))
  }
}
