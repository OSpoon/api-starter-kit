import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'

import { IM_CONFIGURATION_CHANGED_CHANNEL } from '#services/im_configuration_change_listener'

export async function notifyImConfigurationChanged() {
  try {
    await db.rawQuery('select pg_notify(?, ?)', [IM_CONFIGURATION_CHANGED_CHANNEL, 'changed'])
  } catch (error) {
    logger.warn({ err: error }, 'Unable to publish IM configuration change notification')
  }
}
