import { BaseCommand } from '@adonisjs/core/ace'

import { runAiAutomationWorker } from '#services/ai_automation_worker_service'

export default class AiAutomationWorker extends BaseCommand {
  static commandName = 'ai:automation:worker'
  static description = 'Run scheduled AI automations'
  static options = { startApp: true }

  async run() {
    await runAiAutomationWorker()
  }
}
