import { BaseCommand } from '@adonisjs/core/ace'

import { createDingTalkAiRuntime } from '#channels/dingtalk/dingtalk_ai_runtime'

export default class DingTalkBot extends BaseCommand {
  static commandName = 'dingtalk:bot'
  static description = 'Run the DingTalk AI bot Stream worker'
  static options = { startApp: true }

  async run() {
    const runtime = await createDingTalkAiRuntime()
    if (!runtime) {
      this.logger.error('DingTalk bot is not configured. Configure it in LLM settings.')
      this.exitCode = 1
      return
    }
    await runtime.start()
    this.logger.info('DingTalk AI bot WebSocket worker started')
    await new Promise<void>((resolve) => {
      const shutdown = async () => {
        process.off('SIGTERM', shutdown)
        process.off('SIGINT', shutdown)
        await runtime.stop()
        resolve()
      }
      process.once('SIGINT', shutdown)
      process.once('SIGTERM', shutdown)
    })
  }
}
