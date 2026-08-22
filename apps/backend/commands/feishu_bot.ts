import { BaseCommand } from '@adonisjs/core/ace'

import { createFeishuAiRuntime } from '#channels/feishu/feishu_ai_runtime'

export default class FeishuBot extends BaseCommand {
  static commandName = 'feishu:bot'
  static description = 'Run the Feishu bot WebSocket AI channel worker'
  static options = { startApp: true }

  async run() {
    const runtime = await createFeishuAiRuntime()
    if (!runtime) {
      this.logger.error('Feishu bot is not configured. Configure it in LLM settings.')
      this.exitCode = 1
      return
    }

    await runtime.start()
    this.logger.info('Feishu AI bot WebSocket worker started')

    await new Promise<void>((resolve) => {
      const shutdown = async () => {
        process.off('SIGTERM', shutdown)
        process.off('SIGINT', shutdown)
        await runtime.stop()
        resolve()
      }
      process.once('SIGTERM', shutdown)
      process.once('SIGINT', shutdown)
    })
  }
}
