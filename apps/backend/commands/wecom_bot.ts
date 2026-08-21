import { BaseCommand } from '@adonisjs/core/ace'

import { createWecomAiRuntime } from '#channels/wecom/wecom_ai_runtime'

export default class WecomBot extends BaseCommand {
  static commandName = 'wecom:bot'
  static description = 'Run the WeCom intelligent-bot WebSocket AI channel worker'
  static options = { startApp: true }

  async run() {
    const runtime = await createWecomAiRuntime()
    if (!runtime) {
      this.logger.error(
        'WeCom bot is not configured. Configure Bot ID, Bot Secret, and Tenant ID in the LLM configuration menu.'
      )
      this.exitCode = 1
      return
    }

    await runtime.start()
    this.logger.info('WeCom AI bot WebSocket worker started')

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
