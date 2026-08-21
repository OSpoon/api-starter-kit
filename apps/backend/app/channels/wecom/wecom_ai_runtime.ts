import { AiChannelBridge } from '#channels/ai_channel_bridge'
import { WecomBotAdapter } from '#channels/wecom/wecom_bot_adapter'
import { readRuntimeWecomBotConfiguration } from '#services/llm_configuration_service'

export async function createWecomAiRuntime() {
  const config = await readRuntimeWecomBotConfiguration()
  if (!config) return null

  let bridge: AiChannelBridge
  const adapter = new WecomBotAdapter({
    botId: config.botId,
    secret: config.secret,
    tenantId: config.tenantId,
    wsUrl: config.wsUrl,
    onMessage: (message) => bridge.handleMessage(message),
    onMessageStream: (message, emit) => bridge.handleMessageStream(message, emit),
    onTemplateCardEvent: (event) => bridge.handleTemplateCardEvent(event),
  })
  bridge = new AiChannelBridge(adapter)
  return bridge
}
