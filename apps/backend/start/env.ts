/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  // Node
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  // App
  APP_KEY: Env.schema.secret(),
  APP_URL: Env.schema.string({ format: 'url', tld: false }),

  // Admin
  ADMIN_EMAIL: Env.schema.string.optional(),
  ADMIN_PASSWORD: Env.schema.string.optional(),
  ADMIN_FULL_NAME: Env.schema.string.optional(),

  // Session
  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory', 'database'] as const),

  // Database
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.string(),
  DB_DATABASE: Env.schema.string(),

  // CORS
  CORS_ORIGIN: Env.schema.string.optional(),

  // AI
  AI_OPENAI_API_KEY: Env.schema.string.optional(),
  AI_OPENAI_BASE_URL: Env.schema.string.optional({ format: 'url', tld: false }),
  AI_OPENAI_MODEL: Env.schema.string.optional(),
  AI_SYSTEM_PROMPT: Env.schema.string.optional(),
  AI_TEMPERATURE: Env.schema.number.optional(),
  AI_MAX_HISTORY_MESSAGES: Env.schema.number.optional(),
})
