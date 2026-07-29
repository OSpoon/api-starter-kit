import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    await this.schema.raw('CREATE SCHEMA IF NOT EXISTS "ai_agent"')
    await this.schema.raw(`
      CREATE TABLE IF NOT EXISTS ai_agent.checkpoint_migrations (
        v INTEGER PRIMARY KEY
      )
    `)
    await this.schema.raw(`
      CREATE TABLE IF NOT EXISTS ai_agent.checkpoints (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL DEFAULT '',
        checkpoint_id TEXT NOT NULL,
        parent_checkpoint_id TEXT,
        type TEXT,
        checkpoint JSONB NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}',
        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
      )
    `)
    await this.schema.raw(`
      CREATE TABLE IF NOT EXISTS ai_agent.checkpoint_blobs (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL DEFAULT '',
        channel TEXT NOT NULL,
        version TEXT NOT NULL,
        type TEXT NOT NULL,
        blob BYTEA,
        PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
      )
    `)
    await this.schema.raw(`
      CREATE TABLE IF NOT EXISTS ai_agent.checkpoint_writes (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL DEFAULT '',
        checkpoint_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        idx INTEGER NOT NULL,
        channel TEXT NOT NULL,
        type TEXT,
        blob BYTEA NOT NULL,
        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
      )
    `)

    await this.schema.raw(
      'INSERT INTO ai_agent.checkpoint_migrations (v) VALUES (4) ON CONFLICT (v) DO NOTHING'
    )
  }

  async down() {
    await this.schema.raw('DROP SCHEMA IF EXISTS "ai_agent" CASCADE')
  }
}
