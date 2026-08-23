import { AiChannelBridge } from '#channels/ai_channel_bridge'
import { DingTalkBotAdapter } from '#channels/dingtalk/dingtalk_bot_adapter'
import { readRuntimeDingTalkBotConfiguration } from '#services/llm_configuration_service'

export async function createDingTalkAiRuntime() {
  const config = await readRuntimeDingTalkBotConfiguration()
  if (!config) return null

  let bridge: AiChannelBridge
  const adapter = new DingTalkBotAdapter({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    cardTemplateId: config.cardTemplateId,
    streamingCardTemplateId: config.streamingCardTemplateId,
    onMessage: (message) => bridge.handleMessage(message),
    onMessageStream: (message, emit) => bridge.handleMessageStream(message, emit),
    onTemplateCardEvent: (event) => bridge.handleTemplateCardEvent(event),
  })
  bridge = new AiChannelBridge(adapter)
  return bridge
}
