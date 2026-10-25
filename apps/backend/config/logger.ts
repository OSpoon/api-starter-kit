import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, targets } from '@adonisjs/core/logger'
import app from '@adonisjs/core/services/app'

import env from '#start/env'

const configDirectory = dirname(fileURLToPath(import.meta.url))
const logDirectory = resolve(
  configDirectory,
  app.inProduction ? '../log/backend' : '../../../log/backend'
)
await mkdir(logDirectory, { recursive: true, mode: 0o700 })

const loggerConfig = defineConfig({
  /**
   * Default logger name used by ctx.logger and app logger calls.
   */
  default: 'app',

  loggers: {
    app: {
      /**
       * Toggle this logger on/off.
       */
      enabled: true,

      /**
       * Logger name shown in log records.
       */
      name: env.get('APP_NAME'),

      /**
       * Minimum level to output (trace, debug, info, warn, error, fatal).
       */
      level: env.get('LOG_LEVEL'),

      transport: {
        targets: [
          app.inProduction ? targets.file({ destination: 1 }) : targets.pretty({ sync: true }),
          {
            target: 'pino-roll',
            options: {
              file: resolve(logDirectory, 'backend'),
              size: '20m',
              limit: { count: 5, removeOtherLogFiles: true },
              symlink: true,
              mkdir: true,
              mode: 0o600,
            },
          },
        ],
        sync: !app.inProduction,
      },
    },
  },
})

export default loggerConfig

/**
 * Inferring types for the list of loggers you have configured
 * in your application.
 */
declare module '@adonisjs/core/types' {
  export interface LoggersList extends InferLoggers<typeof loggerConfig> {}
}
