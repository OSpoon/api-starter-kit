# Backend Addendum

Follow the repository-level `AGENTS.md` first. This file adds AdonisJS-specific constraints.

## Request Lifecycle

- Routes declare URL shape, middleware, and controller target. Keep route registration declarative.
- Protected mutations require `middleware.auth()` and the named permission middleware. Apply the narrowest permission per operation.
- Controllers validate input before loading or mutating records, use a transformer/explicit DTO for output, and return domain-appropriate errors.
- Use services for credential generation, encryption, external providers, and behavior shared by multiple controllers.

## Persistence

- Define Lucid relations with explicit pivot tables, timestamps, and delete behavior when a pivot has required columns.
- Do not use a relation `sync`/`attach` path until its pivot schema requirements are represented in the relation configuration.
- Check reference counts before deleting roles, permissions, or other authorization records. Return `409` rather than silently removing active grants.
- Keep generated database schema files generated; do not hand-edit them.

## Authentication And Credentials

- Generated credentials (passwords, API keys) use the shared credential service. Only a non-reversible hash is persisted; the raw value is disclosed exactly once in the create response and never appears in logs or later read/list/update endpoints.
- Password reset, 2FA disablement, API key revocation, account deletion, and other security-sensitive mutations require deliberate server-side checks.
- A current user must not be able to remove the last protection that would lock all administrators out.

## Tests

- Test a successful authorization path and a denied authorization path for every new permission-protected capability.
- Test response DTOs for management endpoints when the frontend depends on nested roles, permissions, counts, or status fields.

## Module Boundaries And Naming

- Name files after reusable responsibilities, not temporary organizational or page-specific context. Avoid barrel files unless the local package already establishes that convention.
- Controllers coordinate HTTP only; validators own input, services own reusable domain logic, Lucid models own persistence relations, and transformers or explicit serializers own output.
- Do not import one controller from another. Use the existing backend aliases, including `#controllers/*`, `#services/*`, `#validators/*`, and `#transformers/*`.
- Keep service methods focused on reusable domain behavior; do not add abstractions for one-off logic.

## AI Conversations, Queries, And Actions

- Persist complete conversation messages. Context compression affects model requests only and must never truncate stored history or history APIs.
- Use a persisted rolling summary with a covered-message boundary, retain the system prompt and recent messages, enable compression by default through validated environment variables, and fall back to a bounded recent-message window if summarization fails.
- Manage AI prompts centrally in `ai_agent_prompt_policy`. Keep system policy limited to stable behavioral and security boundaries, and domain policy limited to domain-level workflow constraints. Tool descriptions, schemas, and server-side services own tool-specific parameters, target-resolution rules, validation, authorization, redaction, and error behavior; do not duplicate those contracts in system or domain prompts.
- Extend AI capabilities only through `ai_agent_tool_registry`, `ai_agent_query_registry`, `ai_agent_action_registry`, and the shared confirmation flow. Never create a parallel provider client, controller, route, orchestration loop, or tool registry. Domain services remain the single execution boundary for HTTP APIs and AI tools.
- Do not implement intent recognition with keyword, substring, or regular-expression matching. Resolve intent through the model and registered tool contracts, then validate and authorize the structured operation on the server. Deterministic routing is allowed only from an explicit, validated structured field.
- Models must never generate or execute free-form SQL. Reads use registered templates with stable code/version, parameter schema, named permission, server-derived scope, field redaction, and a result limit.
- Revalidate parameters, conversation/user ownership, and authorization immediately before each template query. Redact and bound results before they reach the model, chat history, logs, or observability. Persist only pending parameter state when information is missing; revalidate ownership, expiry, template validity, authorization, and target state on continuation.
- Audit each executed query with requester, template code/version, non-sensitive parameter summary, authorization outcome, result count, and duration. Never store raw results or sensitive parameters.
- Test templates for allowed and denied authorization, parameter validation, redaction, bounds, and multi-turn parameter completion; add scope tests for tenant-scoped data.
- AI must not directly execute destructive or security-sensitive mutations. It may only create a persisted proposal through `ai_agent_action_registry`. Confirmation must revalidate conversation ownership, authorization, proposal status and expiry, and current target state before invoking the registered executor.
- Every action requires a stable code, named permission, safe target summary, `prepare` logic, and executor. Use the existing confirmation API and client approval strip above the assistant input. Model text or Markdown is never an authorization channel.
- Every AI-exposed capability defines structured input/output, missing-parameter behavior, redaction, permission, audit metadata, and allow/deny regression tests before registration. Preview/query tools are side-effect free; external sends and other mutations are actions, not ordinary tools.
