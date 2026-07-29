import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('users', (table) => {
      table.increments('id').notNullable()
      table.string('full_name').nullable()
      table.string('email', 254).notNullable().unique()
      table.string('password').notNullable()
      table.boolean('two_factor_enabled').notNullable().defaultTo(false)
      table.timestamp('password_changed_at').nullable()
      table.text('two_factor_secret').nullable()
      table.text('two_factor_recovery_codes').nullable()
      table.integer('failed_login_attempts').notNullable().defaultTo(0)
      table.timestamp('locked_until').nullable()
      table.timestamp('disabled_at').nullable().index()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })

    this.schema.createTable('auth_access_tokens', (table) => {
      table.increments('id')
      table
        .integer('tokenable_id')
        .unsigned()
        .notNullable()
        .references('users.id')
        .onDelete('CASCADE')
      table.string('type').notNullable()
      table.string('name').nullable()
      table.string('hash').notNullable()
      table.text('abilities').notNullable()
      table.timestamp('created_at')
      table.timestamp('updated_at')
      table.timestamp('last_used_at').nullable()
      table.timestamp('expires_at').nullable()
    })

    this.schema.createTable('api_keys', (table) => {
      table.increments('id')
      table.string('name').notNullable()
      table.string('prefix', 16).notNullable()
      table.string('key_hash').notNullable()
      table.timestamp('last_used_at').nullable()
      table.timestamp('expires_at').nullable()
      table.timestamp('revoked_at').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.index(['revoked_at'])
      table.index(['expires_at'])
    })

    this.schema.createTable('roles', (table) => {
      table.increments('id').notNullable()
      table.string('code', 100).notNullable().unique()
      table.string('name', 120).notNullable()
      table.text('description').nullable()
      table.boolean('is_system').notNullable().defaultTo(false)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })

    this.schema.createTable('permissions', (table) => {
      table.increments('id').notNullable()
      table.string('code', 100).notNullable().unique()
      table.string('name', 120).notNullable()
      table.string('group_name', 120).notNullable()
      table.text('description').nullable()
      table.boolean('is_system').notNullable().defaultTo(false)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })

    this.schema.createTable('user_roles', (table) => {
      table.integer('user_id').unsigned().notNullable().references('users.id').onDelete('RESTRICT')
      table.integer('role_id').unsigned().notNullable().references('roles.id').onDelete('RESTRICT')
      table.timestamp('created_at').notNullable()
      table.primary(['user_id', 'role_id'])
    })

    this.schema.createTable('role_permissions', (table) => {
      table.integer('role_id').unsigned().notNullable().references('roles.id').onDelete('RESTRICT')
      table
        .integer('permission_id')
        .unsigned()
        .notNullable()
        .references('permissions.id')
        .onDelete('RESTRICT')
      table.timestamp('created_at').notNullable()
      table.primary(['role_id', 'permission_id'])
    })

    this.schema.createTable('audit_logs', (table) => {
      table.increments('id')
      table
        .integer('actor_user_id')
        .unsigned()
        .nullable()
        .references('users.id')
        .onDelete('SET NULL')
      table.string('action', 120).notNullable()
      table.string('target_type', 80).notNullable()
      table.string('target_id', 120).nullable()
      table.jsonb('metadata').nullable()
      table.string('ip_address', 64).nullable()
      table.string('user_agent', 512).nullable()
      table.string('request_id', 120).nullable()
      table.timestamp('created_at').notNullable()
      table.index(['created_at'])
      table.index(['actor_user_id', 'created_at'])
      table.index(['target_type', 'target_id'])
    })

    this.schema.createTable('github_identities', (table) => {
      table.increments('id').notNullable()
      table.integer('user_id').unsigned().notNullable().unique()
      table.bigInteger('github_id').notNullable().unique()
      table.string('github_login', 255).notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.foreign('user_id').references('users.id').onDelete('CASCADE')
    })

    this.schema.createTable('github_login_exchanges', (table) => {
      table.increments('id').notNullable()
      table.integer('user_id').unsigned().notNullable()
      table.string('code_hash', 64).notNullable().unique()
      table.timestamp('expires_at').notNullable().index()
      table.timestamp('used_at').nullable()
      table.timestamp('created_at').notNullable()
      table.foreign('user_id').references('users.id').onDelete('CASCADE')
    })

    this.schema.createTable('ai_chat_conversations', (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
      table.string('title', 160).notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.index(['user_id', 'updated_at'])
    })

    this.schema.createTable('ai_chat_messages', (table) => {
      table.increments('id')
      table
        .integer('conversation_id')
        .unsigned()
        .notNullable()
        .references('ai_chat_conversations.id')
        .onDelete('CASCADE')
      table.enum('role', ['user', 'assistant']).notNullable()
      table.text('content').notNullable()
      table.jsonb('citations').notNullable().defaultTo('[]')
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.index(['conversation_id', 'created_at'])
    })

    this.schema.createTable('ai_agent_confirmations', (table) => {
      table.increments('id')
      table
        .integer('conversation_id')
        .unsigned()
        .notNullable()
        .references('ai_chat_conversations.id')
        .onDelete('CASCADE')
      table
        .integer('assistant_message_id')
        .unsigned()
        .nullable()
        .references('ai_chat_messages.id')
        .onDelete('SET NULL')
      table
        .integer('requested_by_user_id')
        .unsigned()
        .notNullable()
        .references('users.id')
        .onDelete('CASCADE')
      table.string('agent_run_id', 80).notNullable()
      table.string('action', 120).notNullable()
      table.string('target_type', 80).nullable()
      table.string('target_id', 120).nullable()
      table.jsonb('target_summary').nullable()
      table.jsonb('payload').notNullable()
      table.enum('status', ['pending', 'confirmed', 'expired', 'failed']).notNullable()
      table.timestamp('expires_at').notNullable()
      table.timestamp('confirmed_at').nullable()
      table
        .integer('confirmed_by_user_id')
        .unsigned()
        .nullable()
        .references('users.id')
        .onDelete('SET NULL')
      table.string('execution_token', 80).nullable()
      table.timestamp('execution_started_at').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.index(['conversation_id', 'assistant_message_id'])
      table.index(['requested_by_user_id', 'status', 'expires_at'])
      table.index(['agent_run_id'])
      table.index(['target_type', 'target_id'])
      table.index(['status', 'execution_token'])
    })
    this.schema.raw(`
      CREATE UNIQUE INDEX ai_agent_confirmations_pending_run_scope_unique
      ON ai_agent_confirmations (
        conversation_id,
        requested_by_user_id,
        agent_run_id,
        action,
        target_type,
        target_id
      )
      WHERE status = 'pending'
    `)

    this.schema.createTable('ai_agent_pending_queries', (table) => {
      table.increments('id')
      table
        .integer('conversation_id')
        .unsigned()
        .notNullable()
        .references('ai_chat_conversations.id')
        .onDelete('CASCADE')
      table
        .integer('requested_by_user_id')
        .unsigned()
        .notNullable()
        .references('users.id')
        .onDelete('CASCADE')
      table.string('template_code', 120).notNullable()
      table.integer('template_version').unsigned().notNullable()
      table.jsonb('params').notNullable()
      table.jsonb('missing_fields').notNullable()
      table
        .enum('status', ['collecting_parameters', 'executed', 'cancelled', 'expired'])
        .notNullable()
      table.timestamp('expires_at').notNullable()
      table.timestamp('completed_at').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.index(['conversation_id', 'requested_by_user_id', 'status', 'expires_at'])
    })

    this.schema.raw('CREATE EXTENSION IF NOT EXISTS vector')
    this.schema.raw(`
      CREATE TABLE knowledge_documents (
        id BIGSERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        required_permission VARCHAR(100),
        content_hash CHAR(64) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    this.schema.raw(`
      CREATE TABLE knowledge_chunks (
        id BIGSERIAL PRIMARY KEY,
        document_id BIGINT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding vector(1024) NOT NULL,
        embedding_model VARCHAR(120) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (document_id, chunk_index)
      )
    `)
    this.schema.raw(
      'CREATE INDEX knowledge_chunks_embedding_idx ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)'
    )
    this.schema.raw(`
      CREATE TABLE knowledge_document_roles (
        document_id BIGINT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
        role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (document_id, role_id)
      )
    `)
    this.schema.raw(
      'CREATE INDEX knowledge_document_roles_role_idx ON knowledge_document_roles (role_id, document_id)'
    )

    // `migration:fresh` clears public tables but leaves non-public schemas.
    // Checkpoints are derived Agent runtime state, so a baseline rebuild must
    // never reuse them after the application data has been recreated.
    this.schema.raw('DROP SCHEMA IF EXISTS ai_agent CASCADE')
    this.schema.raw('CREATE SCHEMA ai_agent')
    this.schema.raw('CREATE TABLE ai_agent.checkpoint_migrations (v INTEGER PRIMARY KEY)')
    this.schema.raw(`
      CREATE TABLE ai_agent.checkpoints (
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
    this.schema.raw(`
      CREATE TABLE ai_agent.checkpoint_blobs (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL DEFAULT '',
        channel TEXT NOT NULL,
        version TEXT NOT NULL,
        type TEXT NOT NULL,
        blob BYTEA,
        PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
      )
    `)
    this.schema.raw(`
      CREATE TABLE ai_agent.checkpoint_writes (
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
    this.schema.raw('INSERT INTO ai_agent.checkpoint_migrations (v) VALUES (4)')
  }

  async down() {
    this.schema.raw('DROP SCHEMA IF EXISTS ai_agent CASCADE')
    this.schema.raw('DROP TABLE IF EXISTS knowledge_document_roles')
    this.schema.raw('DROP TABLE IF EXISTS knowledge_chunks')
    this.schema.raw('DROP TABLE IF EXISTS knowledge_documents')
    this.schema.dropTableIfExists('ai_agent_pending_queries')
    this.schema.dropTableIfExists('ai_agent_confirmations')
    this.schema.dropTableIfExists('ai_chat_messages')
    this.schema.dropTableIfExists('ai_chat_conversations')
    this.schema.dropTableIfExists('github_login_exchanges')
    this.schema.dropTableIfExists('github_identities')
    this.schema.dropTableIfExists('audit_logs')
    this.schema.dropTableIfExists('role_permissions')
    this.schema.dropTableIfExists('user_roles')
    this.schema.dropTableIfExists('permissions')
    this.schema.dropTableIfExists('roles')
    this.schema.dropTableIfExists('api_keys')
    this.schema.dropTableIfExists('auth_access_tokens')
    this.schema.dropTableIfExists('users')
  }
}
