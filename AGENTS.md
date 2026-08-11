# API Starter Kit Engineering Guidelines

This repository is a pnpm workspace and Turborepo monorepo:

- `apps/backend`: AdonisJS 7, Lucid, Bouncer, Vine, and OpenAPI.
- `apps/frontend`: Vue 3, Vite, Pinia, Vue Router, Tailwind CSS, and Reka UI.
- Core capabilities: authentication and 2FA, RBAC, API keys, audit logging, a knowledge base, and controlled AI conversations, queries, and actions.

Every change must reuse the existing architecture, shared primitives, and contracts. Do not create a parallel implementation for a single page or endpoint.

## Instruction Precedence and Entry Points

1. System and user instructions take precedence over this file. The closest nested `AGENTS.md` may add constraints but must not weaken these rules.
2. `AGENTS.md` is the single source of project standards. Tool entry points such as `CLAUDE.md` must only point here and must not duplicate or conflict with these rules.
3. `must`, `never`, and `only` are mandatory. Any exception must be documented in the final summary with its technical rationale and a path to remove it.
4. Read the root and closest `AGENTS.md` before editing, then inspect adjacent modules, shared primitives, tests, and API contracts. Do not reproduce an existing inconsistency.

## Minimum Change Planning

Before editing, state the applicable page, API, security, or data contract; identify a comparable implementation; and list the verification commands that apply. State the scope before changing cross-app contracts, routes, permissions, databases, shared components, or AI tool registries.

Keep changes focused. Do not mix in unrelated refactors, formatting cleanup, or dependency upgrades, and do not revert user changes.

## Repository and Commands

- Use Node.js `>= 24.12.0` and pnpm `11.9.0`; do not mix npm or yarn into the workspace.
- Root scripts: `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm format`, and `pnpm typecheck`.
- Backend scripts: `pnpm --dir apps/backend typecheck`, `lint:check`, `test`, and `exec node ace migration:status`.
- Frontend scripts: `pnpm --dir apps/frontend typecheck`, `lint:check`, `test`, and `build`.
- `lint` and `format` write files by default. Use `lint:check` for verification, and confirm that the scope of formatting or auto-fixes belongs to the task before running them.
- Follow the repository RTK convention for shell commands: prefix commands with `rtk`.

## Module Boundaries and Naming

- Name files after reusable responsibilities, not temporary organizational or page-specific context. Avoid barrel files unless the local package already establishes that convention.
- Vue `views` compose route-level workflows only. Put cross-domain UI in `components/common`, page templates in `components/templates`, reusable domain UI in `features/<feature>/components`, and domain APIs in `features/<feature>/api.ts`.
- Put stable, reusable state machines and side effects—requests, loading, pagination, filtering, form orchestration, and lifecycle handling—in `composables`. Do not extract a composable for one-off presentation logic.
- Backend controllers coordinate HTTP only. Vine validators own input, services own reusable domain logic, Lucid models own persistence relations, and transformers or explicit serializers own output. Do not import one controller from another.
- Respect the existing backend aliases, including `#controllers/*`, `#services/*`, `#validators/*`, and `#transformers/*`.

## Backend, API, and Data

- `apps/backend` is the sole authority for authentication, authorization, validation, persistence, and the API contract. `apps/frontend` must never become a security boundary.
- Declare URLs, middleware, and controller targets declaratively in `apps/backend/start/routes.ts`. Business APIs live under `/api/v1`; add or update OpenAPI decorators and frontend client types with every public API change.
- Validate every request with Vine before reading or mutating data. Use `serialize()`, transformers, or explicit DTOs to return only required fields; never expose model internals, hashes, tokens, encrypted values, or pivot data by default.
- Successful endpoints follow the existing `{ data: ... }` envelope produced by `serialize()`. Paginated lists return `items` and `meta` within `data`. Update frontend API clients, types, and tests with every response-shape change.
- Use the correct semantics: `401` unauthenticated, `403` unauthorized, `409` referenced-record or conflict, and `422` validation failure. Potentially unbounded lists require server-side pagination and limits.
- Define ownership, authorization, conflict behavior, and audit-sensitive side effects before implementing every mutation. Credential generation, encryption, and external-provider calls belong in services.
- Never edit an applied migration. Add a migration for every schema or data change, define foreign keys, uniqueness, indexes, and delete behavior deliberately, and verify with `pnpm --dir apps/backend exec node ace migration:status` against the intended local environment only.

## Authentication, RBAC, and Sensitive Data

- Browser-supplied roles, permissions, IDs, and state are untrusted. Every protected API operation must use `middleware.auth()` and the narrowest named `middleware.permission([...])`. Authorize through the Bouncer `access` ability; do not bypass shared authorization with controller-local checks.
- Permission codes use the stable `resource:action` format. Declare them in `apps/backend/app/services/permission_catalog.ts` before using them in routes, APIs, menus, or controls. Roles compose permissions; users receive roles.
- Every new navigable page or menu must have its own least-privilege read permission (for example, `system-status:read`) declared in `permission_catalog.ts`; bind the same code to the frontend route `meta.permission` and every corresponding backend route middleware. Add or update the system permission migration and allow/deny authorization tests in the same change. Do not reuse `dashboard:view` or another broader permission for a distinct product capability.
- `super-admin` is a protected bootstrap role. It cannot be assigned or have its membership changed through the management UI or API. Reuse the `super_admin_access` service and cover lockout risks when changing this behavior or the last administrator protection.
- Route `meta.permission` is the shared source of navigation, route protection, and visibility. Use `usePermission()` from `@/lib/permission` for action-level frontend affordances; frontend visibility never replaces backend authorization.
- API keys, passwords, and recovery codes may be disclosed only once through the established secure services. Never log them, persist them in browser state, or return them from ordinary read or subsequent update endpoints. Confirm security-sensitive and irreversible operations.

## Frontend Pages and UX

- Route definitions are the single source of truth for titles, navigation, breadcrumbs, permissions, and `meta.pageKind`. Every new product page has exactly one root page primitive:

  | Intent                  | `meta.pageKind` | Root primitive                         |
  | ----------------------- | --------------- | -------------------------------------- |
  | CRUD or management list | `list`          | `ListPage` + `DataTable`               |
  | Resource detail         | `detail`        | `DetailPageTemplate`                   |
  | Settings                | `settings`      | `SettingsPageTemplate`                 |
  | Overview                | `dashboard`     | `DashboardPageTemplate` or `PageShell` |
  | Multi-step flow         | `wizard`        | `WizardPageTemplate`                   |
  | Process flow            | `workflow`      | `WorkflowPageTemplate`                 |
  | Analytics               | `analytics`     | `AnalyticsPageTemplate`                |
  | Authentication          | `auth`          | `CardPageShell`                        |
  | Domain utility          | `utility`       | `PageShell`                            |

- CRUD and management lists must use `components/common/ListPage.vue` and `DataTable.vue`; use `PageShell.vue` only for non-list pages. Do not recreate page headers, toolbars, tables, pagination, empty states, or dialog hosts in a view.
- Use `ConfirmDialog.vue` for destructive or security-sensitive confirmations, `PermissionTransfer.vue` for role permission assignment, and `FormDialogContent.vue` plus `FormDialogFooter.vue` for standard form dialogs. Extend a shared component for reusable behavior instead of adding a one-page prop or parallel component.
- All frontend forms must use the shared `vee-validate` + `Zod` pattern: define a typed schema with `toTypedSchema`, create the form with `useForm`, bind fields through `FormField`/`FormControl`, and render field-level errors with `FormMessage`. Use `firstFormError` for invalid-submit feedback. Do not add new forms using native `required`, ad hoc `if` validation, or a page-local validation library; backend Vine validation remains authoritative for security and persistence.
- Use locale keys for every user-visible string. Every input, textarea, select, and combobox needs an independent visible label. Icon controls use Lucide and require an accessible name and tooltip or title.
- New or changed interactions must cover loading, empty, error, disabled, and permission states, and must not overflow or overlap on desktop or mobile. Persist only non-sensitive preferences that materially improve repeat use, using the shared versioned and namespaced browser-preference mechanism.
- Use `@/lib/api` for frontend API calls, following the existing `ApiError` and Bearer-token conventions. Features must not bypass common error handling or introduce a parallel HTTP client.

### Frontend Reference Implementations

Start with the comparable implementation and reuse its shared primitives rather than copying the entire page:

| Need                                          | Reference                                                         |
| --------------------------------------------- | ----------------------------------------------------------------- |
| Management list, table, create/revoke dialogs | `apps/frontend/src/views/ApiKeysView.vue`                         |
| RBAC and role permission assignment           | `apps/frontend/src/views/AccessControlView.vue`                   |
| Settings and security states                  | `apps/frontend/src/views/ProfileView.vue`                         |
| Knowledge-base feature organization           | `apps/frontend/src/features/knowledge/KnowledgeDocumentsPage.vue` |
| Analytics, workflow, and wizard templates     | The corresponding `*TemplateView.vue`                             |

## AI Conversations, Controlled Queries, and Controlled Actions

- Persist complete conversation messages. Context compression affects model requests only and must never truncate stored history or history APIs. Use a persisted rolling summary with a covered-message boundary, retain the system prompt and recent messages, enable compression by default through validated environment variables, and fall back to a bounded recent-message window if summarization fails.
- Manage AI prompts centrally in `ai_agent_prompt_policy`. Keep system policy limited to stable behavioral and security boundaries, and domain policy limited to domain-level workflow constraints. Tool descriptions, schemas, and server-side services own tool-specific parameters, target-resolution rules, validation, authorization, redaction, and error behavior; do not duplicate those contracts in system or domain prompts.
- Extend the existing AI capability only through `ai_agent_tool_registry`, `ai_agent_query_registry`, `ai_agent_action_registry`, and the shared confirmation flow. Never create a parallel AI provider client, controller, route, orchestration loop, or tool registry for a feature. Domain services remain the single execution boundary and must be called by both HTTP APIs and AI tools.
- Do not implement AI intent recognition with keyword, substring, or regular-expression matching. Resolve intent through the model and registered tool contracts, then validate and authorize the resulting structured operation on the server. Deterministic routing is allowed only when it is based on an explicit, validated structured field rather than natural-language text.
- Models must never generate or execute free-form SQL. Data reads are available only through registered templates in `ai_agent_query_registry`, each with a stable code and version, parameter schema, named permission, server-derived scope, field redaction, and result limit.
- Revalidate parameters, conversation/user ownership, and authorization immediately before each template query. Redact and bound results before they reach the model, chat history, logs, or observability services. For missing parameters, create a persisted pending query and revalidate ownership, expiry, template validity, authorization, and target state on continuation.
- Audit every executed query with the requester, template code and version, non-sensitive parameter summary, authorization outcome, result count, and duration. Never store raw results or sensitive parameters. New templates require tests for allowed and denied authorization, parameter validation, redaction, bounds, and multi-turn parameter completion; add scope tests for tenant-scoped data.
- AI must not directly execute destructive or security-sensitive mutations. It may only create a persisted proposal through `ai_agent_action_registry`. Confirmation must revalidate conversation ownership, authorization, proposal status and expiry, and current target state before invoking the registered executor.
- Every new action requires a stable action code, named permission, safe target summary, `prepare` logic, and executor. Use the existing generic confirmation API and approval strip above the assistant input. Model text or Markdown is never an authorization channel.
- For WeCom message templates, AI tools may expose only the minimum domain capabilities needed by the assistant: authorized template discovery, parameter validation/render preview, and a confirmed send proposal. Reuse `wecom_message_template_service`; never expose Webhook URLs, encrypted credentials, API Keys, or internal model fields to the model. Sending must use the internal service path, accept template ID plus structured parameters and runtime mention lists, enforce `wecom-templates:read`/`wecom-templates:send`, and require a persisted confirmation before the external request. Template creation, editing, deletion, Webhook changes, media operations, and direct test sends remain management UI operations unless separately approved with the same action and audit requirements.
- Every AI-exposed domain capability must define its structured input/output schema, missing-parameter behavior, redaction rules, permission code, audit metadata, and allow/deny regression tests before registration. Preview/query tools must be side-effect free; external sends and other mutations must be represented as actions rather than ordinary tools.

## Testing and Delivery

- Add focused regression tests for bugs and high-risk behavior. Authorization, authentication, credentials, migrations, and API contracts require backend allow and deny coverage; UI behavior alone is insufficient.
- Verify the affected layer:

  | Change type                                                  | Minimum verification                                                                                             |
  | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
  | Frontend view, component, route, or locale                   | `pnpm --dir apps/frontend typecheck`, `lint:check`; also `build` for templates, routes, or component composition |
  | Backend controller, validator, model, service, or middleware | `pnpm --dir apps/backend typecheck`, `lint:check`, and focused or full `test`                                    |
  | Migration or schema                                          | Migration status, backend typecheck, and a persistence test when behavior changes                                |
  | Authentication, authorization, credential, or secret flow    | Backend allow and deny tests                                                                                     |
  | Shared component or cross-app contract                       | Verification for every affected app plus `git diff --check`                                                      |

- Update `README.md` when a change affects documented setup, environment variables, Docker, migrations, API behavior, or template capabilities.
- The final summary must state the implemented behavior, key verification results, and every verification gap. Never describe an unrun or blocked command as passing.
