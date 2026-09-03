import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'

import { recordAuditEvent } from '#services/audit_log'
import {
  getImConfiguration,
  serializeImConfiguration,
  updateImConfiguration,
} from '#services/llm_configuration_service'
import { updateImConfigurationValidator } from '#validators/im_configuration'

@ApiSecurity('bearerAuth')
export default class ImConfigurationsController {
  @ApiOperation({ summary: '获取 IM 配置' })
  @ApiResponse({ status: 200, description: 'IM 配置（密钥仅返回配置状态）' })
  async show({ serialize }: HttpContext) {
    return serialize(serializeImConfiguration(await getImConfiguration()))
  }

  @ApiOperation({ summary: '更新 IM 配置' })
  async update(ctx: HttpContext) {
    const { auth, request, serialize } = ctx
    const payload = await request.validateUsing(updateImConfigurationValidator)
    const config = await updateImConfiguration(payload)
    await recordAuditEvent(ctx, {
      actorUserId: auth.getUserOrFail().id,
      action: 'im_config.updated',
      targetType: 'im_configuration',
      targetId: 1,
      metadata: {
        wecomBotId: config.wecomBotId,
        wecomBotTenantId: config.wecomBotTenantId,
        feishuAppId: config.feishuAppId,
        dingtalkClientId: config.dingtalkClientId,
      },
    })
    return serialize(serializeImConfiguration(config))
  }
}
