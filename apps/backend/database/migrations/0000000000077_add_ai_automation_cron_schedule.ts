import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ai_automations', (table) => {
      table.string('schedule_cron', 120).nullable()
    })

    const automations = await this.db
      .from('ai_automations')
      .whereIn('schedule_kind', ['daily', 'weekdays', 'weekly'])
      .select('id', 'schedule_kind', 'schedule_time', 'schedule_weekday')

    for (const automation of automations) {
      const match = /^(\d{2}):(\d{2})$/.exec(automation.schedule_time ?? '')
      if (!match) continue
      const [, hour, minute] = match
      const dayOfWeek =
        automation.schedule_kind === 'weekdays'
          ? '1-5'
          : automation.schedule_kind === 'weekly'
            ? automation.schedule_weekday === 7
              ? '0'
              : String(automation.schedule_weekday)
            : '*'
      if (
        automation.schedule_kind === 'weekly' &&
        (!automation.schedule_weekday || automation.schedule_weekday > 7)
      ) {
        continue
      }

      await this.db
        .from('ai_automations')
        .where('id', automation.id)
        .update({
          schedule_kind: 'cron',
          schedule_cron: `${minute} ${hour} * * ${dayOfWeek}`,
        })
    }
  }

  async down() {
    this.schema.alterTable('ai_automations', (table) => {
      table.dropColumn('schedule_cron')
    })
  }
}
