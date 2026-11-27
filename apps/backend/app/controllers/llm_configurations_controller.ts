import type { HttpContext } from '@adonisjs/core/http'
import { ApiBody, ApiOperation, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'

import { recordAuditEvent } from '#services/audit_log'
import {
  getLlmConfiguration,
  serializeLlmConfiguration,
  updateLlmConfiguration,
} from '#services/llm_configuration_service'
import { testLlmConnections } from '#services/llm_connection_test_service'
import {
  testLlmConnectionValidator,
  updateLlmConfigurationValidator,
} from '#validators/llm_configuration'

import { dataEnvelope, errorResponseSchema } from '../openapi/response_schemas.js'

@ApiSecurity('bearerAuth')
export default class LlmConfigurationsController {
  @ApiOperation({ summary: '获取 LLM 配置与模型限制' })
  @ApiResponse({
    status: 200,
    description: 'LLM 配置包含推理等级及模型限制；密钥仅返回配置状态',
    schema: dataEnvelope({
      type: 'object',
      required: ['chat', 'asr', 'embedding', 'updatedAt'],
      properties: {
        chat: {
          type: 'object',
          required: [
            'baseUrl',
            'model',
            'contextWindow',
            'maxTokens',
            'reasoningLevel',
            'apiKeyConfigured',
          ],
          properties: {
            baseUrl: { type: 'string', nullable: true, format: 'uri' },
            model: { type: 'string' },
            contextWindow: { type: 'integer' },
            maxTokens: { type: 'integer' },
            reasoningLevel: { type: 'string' },
            apiKeyConfigured: { type: 'boolean' },
          },
        },
        asr: {
          type: 'object',
          required: ['baseUrl', 'model', 'apiKeyConfigured'],
          properties: {
            baseUrl: { type: 'string', nullable: true, format: 'uri' },
            model: { type: 'string' },
            apiKeyConfigured: { type: 'boolean' },
          },
        },
        embedding: {
          type: 'object',
          required: ['baseUrl', 'model', 'dimensions', 'apiKeyConfigured'],
          properties: {
            baseUrl: { type: 'string', nullable: true, format: 'uri' },
            model: { type: 'string' },
            dimensions: { type: 'integer' },
            apiKeyConfigured: { type: 'boolean' },
          },
        },
        updatedAt: { type: 'string', nullable: true, format: 'date-time' },
      },
    }),
  })
  async show({ serialize }: HttpContext) {
    return serialize(serializeLlmConfiguration(await getLlmConfiguration()))
  }

  @ApiOperation({ summary: '更新 LLM 配置、推理等级与对话模型限制' })
  @ApiBody({ type: () => updateLlmConfigurationValidator, required: true })
  @ApiResponse({
    status: 200,
    description: '已更新的 LLM 配置；密钥仅返回配置状态',
    schema: dataEnvelope({
      type: 'object',
      required: ['chat', 'asr', 'embedding', 'updatedAt'],
      properties: {
        chat: {
          type: 'object',
          required: [
            'baseUrl',
            'model',
            'contextWindow',
            'maxTokens',
            'reasoningLevel',
            'apiKeyConfigured',
          ],
          properties: {
            baseUrl: { type: 'string', nullable: true, format: 'uri' },
            model: { type: 'string' },
            contextWindow: { type: 'integer' },
            maxTokens: { type: 'integer' },
            reasoningLevel: { type: 'string' },
            apiKeyConfigured: { type: 'boolean' },
          },
        },
        asr: {
          type: 'object',
          required: ['baseUrl', 'model', 'apiKeyConfigured'],
          properties: {
            baseUrl: { type: 'string', nullable: true, format: 'uri' },
            model: { type: 'string' },
            apiKeyConfigured: { type: 'boolean' },
          },
        },
        embedding: {
          type: 'object',
          required: ['baseUrl', 'model', 'dimensions', 'apiKeyConfigured'],
          properties: {
            baseUrl: { type: 'string', nullable: true, format: 'uri' },
            model: { type: 'string' },
            dimensions: { type: 'integer' },
            apiKeyConfigured: { type: 'boolean' },
          },
        },
        updatedAt: { type: 'string', nullable: true, format: 'date-time' },
      },
    }),
  })
  @ApiResponse({ status: 422, description: 'LLM 配置字段无效', schema: errorResponseSchema })
  async update(ctx: HttpContext) {
    const { auth, request, serialize } = ctx
    const payload = await request.validateUsing(updateLlmConfigurationValidator)
    const config = await updateLlmConfiguration(payload)
    await recordAuditEvent(ctx, {
      actorUserId: auth.getUserOrFail().id,
      action: 'llm_config.updated',
      targetType: 'llm_configuration',
      targetId: 1,
      metadata: {
        chatModel: config.chatModel,
        chatContextWindow: config.chatContextWindow,
        chatMaxTokens: config.chatMaxTokens,
        chatReasoningLevel: config.chatReasoningLevel,
        embeddingModel: config.embeddingModel,
      },
    })
    return serialize(serializeLlmConfiguration(config))
  }

  @ApiOperation({
    summary: '测试指定 LLM 连接',
    description: '省略 service 时测试所有已配置模型。',
  })
  @ApiBody({ type: () => testLlmConnectionValidator, required: true })
  @ApiResponse({
    status: 200,
    description: '连接检测结果',
    schema: dataEnvelope({
      type: 'object',
      required: ['ok', 'failedServices'],
      properties: {
        ok: { type: 'boolean' },
        failedServices: {
          type: 'array',
          items: { type: 'string', enum: ['chat', 'asr', 'embedding'] },
        },
      },
    }),
  })
  @ApiResponse({ status: 422, description: '测试服务名称无效', schema: errorResponseSchema })
  async test(ctx: HttpContext) {
    const { service } = await ctx.request.validateUsing(testLlmConnectionValidator)
    return { data: await testLlmConnections(service) }
  }
}
