import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiQuery, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'

import ApiKey from '#models/api_key'
import {
  createApiKey,
  revokeOrDeleteApiKey,
  serializeApiKey,
  updateApiKey,
} from '#services/api_key_service'
import { clampLimit } from '#support/pagination'
import { apiKeyValidator } from '#validators/api_key'
import { paginationSearchQueryValidator } from '#validators/pagination'

@ApiSecurity('bearerAuth')
export default class ApiKeysController {
  @ApiOperation({
    summary: '获取 API Key 列表',
    description:
      '返回外部系统接入密钥分页列表。支持按名称或公开前缀搜索；仅返回 prefix 和元数据，不暴露原始密钥。',
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
  @ApiQuery({
    name: 'search',
    required: false,
    description: '按 API Key 名称或公开前缀搜索；去除首尾空格，空值不过滤，最多 200 个字符',
    schema: { type: 'string', maxLength: 200 },
  })
  @ApiResponse({ status: 200, description: 'API Key 列表' })
  async index({ request, serialize }: HttpContext) {
    const payload = await paginationSearchQueryValidator.validate(request.qs())
    const page = payload.page ?? 1
    const search = payload.search ?? ''
    const query = ApiKey.query().orderBy('created_at', 'desc')
    if (search) {
      query.where((builder) => {
        builder.whereILike('name', `%${search}%`).orWhereILike('prefix', `%${search}%`)
      })
    }
    const paginator = await query.paginate(page, clampLimit(payload.limit, 20, 100))
    return serialize({
      items: paginator.all().map((key) => serializeApiKey(key)),
      meta: paginator.getMeta(),
    })
  }

  @ApiOperation({
    summary: '创建 API Key',
    description: '创建外部系统接入密钥。原始密钥只在创建响应中完整返回一次。',
  })
  @ApiResponse({ status: 200, description: '已创建的 API Key 和原始密钥' })
  async store(ctx: HttpContext) {
    const { auth, request, serialize } = ctx
    const payload = await request.validateUsing(apiKeyValidator)
    const { apiKey, secret } = await createApiKey(ctx, auth.getUserOrFail().id, payload, 'api')

    return serialize({
      ...serializeApiKey(apiKey),
      key: secret,
    })
  }

  @ApiOperation({
    summary: '更新 API Key',
    description: '更新 API Key 的名称和有效期，不会重新生成密钥。',
  })
  @ApiResponse({ status: 200, description: '已更新的 API Key' })
  async update(ctx: HttpContext) {
    const { auth, params, request, serialize } = ctx
    const payload = await request.validateUsing(apiKeyValidator)
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
  @ApiResponse({ status: 200, description: '吊销或删除结果' })
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
