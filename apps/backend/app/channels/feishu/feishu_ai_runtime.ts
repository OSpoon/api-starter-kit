import { AiChannelBridge } from '#channels/ai_channel_bridge'
import { FeishuBotAdapter } from '#channels/feishu/feishu_bot_adapter'
import { readRuntimeFeishuBotConfiguration } from '#services/llm_configuration_service'

export async function createFeishuAiRuntime() {
  const config = await readRuntimeFeishuBotConfiguration()
  if (!config) return null

  let bridge: AiChannelBridge
  const adapter = new FeishuBotAdapter({
    appId: config.appId,
    secret: config.secret,
    domain: config.domain,
    onMessage: (message) => bridge.handleMessage(message),
    onTemplateCardEvent: (event) => bridge.handleTemplateCardEvent(event),
  })
  bridge = new AiChannelBridge(adapter)
  return bridge
}
