# API Starter Kit Project Constraints

This document is the project-level engineering standard for this repository. All development, review, and delivery work must follow it. A closer `AGENTS.md` may add constraints but must not weaken these requirements.

This repository is a pnpm workspace and Turborepo monorepo:

- `apps/backend`: AdonisJS 7, Lucid, Bouncer, Vine, and OpenAPI.
- `apps/frontend`: Vue 3, Vite, Pinia, Vue Router, Tailwind CSS, and Reka UI.
- Core capabilities: authentication and 2FA, RBAC, API keys, audit logging, a knowledge base, and controlled AI conversations, queries, and actions.

## 1. Rule Priority and Enforcement

1. System instructions and explicit user requirements take precedence over this file.
2. `AGENTS.md` is the single source of project standards. Entry points such as `CLAUDE.md` may only point here and must not duplicate or conflict with these rules.
3. `must`, `never`, and `only` are mandatory. Any exception must be documented in the final summary with its technical rationale, impact, and removal path.
4. Before editing, read the root and closest `AGENTS.md`, then inspect adjacent modules, shared primitives, tests, and API contracts. Do not reproduce an existing inconsistency.
5. Every change must reuse the existing architecture, shared primitives, and contracts. Never create a parallel implementation for a single page or endpoint.

## 2. Non-Negotiable Security and Data Rules

### 2.1 Backend Authority and API Contracts

- `apps/backend` is the sole authority for authentication, authorization, validation, persistence, and the API contract. `apps/frontend` must never become a security boundary.
- Declare URLs, middleware, and controller targets declaratively in `apps/backend/start/routes.ts`. Business APIs live under `/api/v1`.
- Validate every request with Vine before reading or mutating data.
- Use `serialize()`, transformers, or explicit DTOs to return only required fields. Never expose model internals, hashes, tokens, encrypted values, or pivot data by default.
- Successful endpoints use the existing `{ data: ... }` envelope produced by `serialize()`. Paginated lists return `items` and `meta` within `data`.
- Public API changes must update OpenAPI decorators, frontend client types, and tests. Every response-shape change must update frontend API clients, types, and tests.
- Use these status semantics: `401` unauthenticated, `403` unauthorized, `409` referenced-record or conflict, and `422` validation failure.
- Potentially unbounded lists require server-side pagination and limits.
- Define ownership, authorization, conflict behavior, and audit-sensitive side effects before implementing every mutation. Credential generation, encryption, and external-provider calls belong in services.

### 2.2 Authentication, Authorization, and Sensitive Data

- Browser-supplied roles, permissions, IDs, and state are untrusted. Every protected API operation must use `middleware.auth()` and the narrowest named `middleware.permission([...])`.
- Authorize through the Bouncer `access` ability. Do not bypass shared authorization with controller-local checks.
- Permission codes use the stable `resource:action` format and must be declared in `apps/backend/app/services/permission_catalog.ts` before use. Roles compose permissions; users receive permissions through roles.
- Every new navigable page or menu must have its own least-privilege read permission, such as `system-status:read`, declared in `permission_catalog.ts`. Bind the same code to the frontend route `meta.permission` and every corresponding backend route middleware. Add or update the system permission migration and allow/deny authorization tests in the same change. Do not reuse `dashboard:view` or another broader permission for a distinct product capability.
- `super-admin` is a protected bootstrap role. It cannot be assigned or have its membership changed through the management UI or API. Reuse the `super_admin_access` service and cover lockout risks when changing this behavior or last-administrator protection.
- Route `meta.permission` is the shared source of navigation, route protection, and visibility. Use `usePermission()` from `@/lib/permission` for action-level frontend affordances; frontend visibility never replaces backend authorization.
- API keys, passwords, and recovery codes may be disclosed only once through the established secure services. Never log them, persist them in browser state, or return them from ordinary read or subsequent update endpoints.
- Confirm security-sensitive and irreversible operations.

### 2.3 Database and Migrations

- Never edit an applied migration. Add a migration for every schema or data change.
- Define foreign keys, uniqueness, indexes, and delete behavior deliberately.
- Verify with `pnpm --dir apps/backend exec node ace migration:status` against the intended local environment only.

## 3. Standard Development Workflow

### 3.0 Greenfield Product Replacement Boundary

Treat every new project built from this repository as a greenfield product unless
the user explicitly says it is an existing product. This repository supplies
system capabilities—authentication, authorization, audit, API contracts,
knowledge, observability, and controlled AI—not a default business domain.

- Start from the user's product idea, domain entities, workflows, and success
  criteria. The starter's dashboard, template pages, demo routes, demo
  navigation groups, sample content, and optional integrations are scaffolding,
  not product features.
- When implementing a new product, replace the starter dashboard with the
  product's actual default landing experience in the same change. Update the
  root redirect, post-authentication destinations, route names, permissions,
  navigation, breadcrumbs, locale keys, and tests that still assume the demo
  dashboard. Never keep the demo dashboard as a parallel user-facing page or
  add a second dashboard with similar placeholder metrics unless the user
  explicitly requests both.
- Remove the starter's user-facing template/demo routes and navigation entries
  from the product shell unless the user explicitly asks to retain a showcase.
  Reusable page primitives and example source files may remain as non-routed
  implementation references when useful; their presence must not expose demo
  product experiences to end users.
- Design the navigation from the product's domain and primary user tasks.
  Business capabilities must use intentional product-level groups and ordering;
  never place them in, beneath, or after a `Templates`, `Examples`, or demo
  group merely because that group exists in the starter. Keep retained system
  administration capabilities in a separate system/settings area.
- Do not plan iterations around generic dashboard, analytics, workflow, wizard,
  or template capabilities unless the user explicitly requests them.
- Keep business implementation in user-defined feature modules. Treat existing
  example views and reusable page primitives as references to adapt or remove,
  not as requirements to preserve.
- A new-product implementation is incomplete while the authenticated product
  shell still presents starter dashboard content, template/demo navigation, or
  a default route that leads to a starter experience.
- When asking the AI agent to extend a new project, state whether the request is
  for a system capability or a user-defined business capability before proposing
  files, routes, permissions, or data models.

### 3.1 Before Editing

Before editing, you must:

1. State the applicable page, API, security, or data contract.
2. Identify a comparable existing implementation.
3. Identify the files, modules, and cross-application impact involved.
4. List the applicable verification commands.
5. Check existing worktree changes, preserve user changes, and never revert unrelated work.

Keep changes focused. Do not mix unrelated refactors, formatting cleanup, or dependency upgrades into the task.

### 3.2 During Implementation

- Reuse existing components, services, composables, clients, registries, and test patterns first.
- For larger tasks, work in stages and provide progress, completed work, and the next step at meaningful checkpoints.
- Small, reversible work within the user's requested scope may continue without pausing after every minor change for approval.
- Before expanding scope across application contracts, routes, permissions, databases, shared components, AI registries, or external systems, state the impact.

### 3.3 When to Pause for Confirmation

Pause and wait for user confirmation when:

- New permissions, external account/system authorization, or external coordination is required.
- The work would expand the original request or change product behavior materially.
- An irreversible or high-risk action is required, such as deleting or overwriting important data, modifying an applied migration, resetting user changes, or sending an external message.
- An unresolved product choice would materially change the implementation and cannot be safely inferred from repository context.
- Verification requires a fix outside the original request's scope.

Ordinary code edits, local verification, and directly related fixes do not require step-by-step approval.

## 4. Frontend Engineering Standards

### 4.1 Pages, Routes, and Layout

- Route definitions are the single source of truth for titles, navigation, breadcrumbs, permissions, and `meta.pageKind`.
- Every product page must have exactly one root page primitive:

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

- CRUD and management lists must use `components/common/ListPage.vue` and `DataTable.vue`. `PageShell.vue` is only for non-list pages. Do not recreate page headers, toolbars, tables, pagination, empty states, or dialog hosts in a view.
- Use `ConfirmDialog.vue` for destructive or security-sensitive confirmations, `PermissionTransfer.vue` for role permission assignment, and `FormDialogContent.vue` plus `FormDialogFooter.vue` for standard form dialogs. Extend shared components for reusable behavior instead of adding one-page props or parallel components.
- Route-level workflows belong in `views`; cross-domain UI belongs in `components/common`; page templates belong in `components/templates`; reusable domain UI belongs in `features/<feature>/components`; domain APIs belong in `features/<feature>/api.ts`.

### 4.2 Forms, Interactions, and API Calls

- All frontend forms must use the shared `vee-validate` + `Zod` pattern: typed schema with `toTypedSchema`, `useForm`, `FormField`/`FormControl`, `FormMessage`, and `firstFormError`.
- Do not add forms using native `required`, ad hoc `if` validation, or a page-local validation library. Backend Vine validation remains authoritative for security and persistence.
- Standard create and edit dialogs must match the observable form behavior and layout established by `apps/frontend/src/features/wecom-message-templates/components/WecomMessageTemplateForm.vue`. The reference implementation and every standard create or edit dialog must satisfy all of the following requirements:
  - Use `FormDialogContent` with a `flex min-h-0 flex-1 flex-col overflow-hidden` form, a separate `min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto` scrolling body, and a shrink-safe `FormDialogFooter`. The scrolling body and field grid must be separate elements.
  - Use the normal `FormMessage` without fixed height, minimum height, placeholder content, or reserved spacing. When a field has no error, no visible validation message may occupy layout space. Submission errors must increase the height of their current grid row naturally so the following row moves down as one unit.
  - Every multi-column field grid must use `items-start`. Fields that need explicit column spans must use wrapper elements. A `FormItem` must remain top-aligned and must never stretch to match a sibling containing a longer validation message.
  - Use responsive columns. Compact controls may share a desktop row. Descriptions, credential fields, editors, JSON payloads, and other long-form controls must span the full row. Multi-column layouts must collapse to one column on narrow screens.
  - Set `:validate-on-blur="false"` on every `FormField`. Submit through a handler created by `form.handleSubmit`; its invalid-submit callback must display `firstFormError`. Preserve the standard change and model-update validation behavior so editing a field after a failed submission refreshes its error immediately. Never introduce reserved-message variants or disable all change or model-update validation.
  - Use the shared `Select`, `SelectTrigger`, and `SelectContent` without page-local positioning or portal overrides. Select overlays inside centered or transformed dialogs must remain in the shared page-level portal coordinate system and must never be mounted inside the transformed dialog container.
- Use locale keys for every user-visible string. Every input, textarea, select, and combobox needs an independent visible label.
- Icon controls use Lucide and require an accessible name and tooltip or title.
- New or changed interactions must cover loading, empty, error, disabled, and permission states, and must not overflow or overlap on desktop or mobile.
- Persist only non-sensitive preferences that materially improve repeat use, using the shared versioned and namespaced browser-preference mechanism.
- Use `@/lib/api` for frontend API calls, following the existing `ApiError` and Bearer-token conventions. Features must not bypass common error handling or introduce a parallel HTTP client.

### 4.3 Frontend Reference Implementations

Start with the comparable implementation and reuse its shared primitives rather than copying the entire page:

| Need                                          | Reference                                                         |
| --------------------------------------------- | ----------------------------------------------------------------- |
| Management list, table, create/revoke dialogs | `apps/frontend/src/views/ApiKeysView.vue`                         |
| RBAC and role permission assignment           | `apps/frontend/src/views/AccessControlView.vue`                   |
| Settings and security states                  | `apps/frontend/src/views/ProfileView.vue`                         |
| Knowledge-base feature organization           | `apps/frontend/src/features/knowledge/KnowledgeDocumentsPage.vue` |
| Analytics, workflow, and wizard templates     | The corresponding `*TemplateView.vue`                             |

## 5. Backend Modules and Naming

- Name files after reusable responsibilities, not temporary organizational or page-specific context. Avoid barrel files unless the local package already establishes that convention.
- Backend controllers coordinate HTTP only. Vine validators own input, services own reusable domain logic, Lucid models own persistence relations, and transformers or explicit serializers own output.
- Do not import one controller from another.
- Put stable, reusable state machines and side effects—requests, loading, pagination, filtering, form orchestration, and lifecycle handling—in `composables`. Do not extract a composable for one-off presentation logic.
- Respect existing backend aliases, including `#controllers/*`, `#services/*`, `#validators/*`, and `#transformers/*`.

## 6. AI Conversations, Queries, and Actions

- Persist complete conversation messages. Context compression affects model requests only and must never truncate stored history or history APIs.
- Use a persisted rolling summary with a covered-message boundary, retain the system prompt and recent messages, enable compression by default through validated environment variables, and fall back to a bounded recent-message window if summarization fails.
- Manage AI prompts centrally in `ai_agent_prompt_policy`. Keep system policy limited to stable behavioral and security boundaries, and domain policy limited to domain-level workflow constraints. Tool descriptions, schemas, and server-side services own tool-specific parameters, target-resolution rules, validation, authorization, redaction, and error behavior; do not duplicate those contracts in system or domain prompts.
- Extend existing AI capabilities only through `ai_agent_tool_registry`, `ai_agent_query_registry`, `ai_agent_action_registry`, and the shared confirmation flow. Never create a parallel AI provider client, controller, route, orchestration loop, or tool registry. Domain services remain the single execution boundary and must be called by both HTTP APIs and AI tools.
- Do not implement AI intent recognition with keyword, substring, or regular-expression matching. Resolve intent through the model and registered tool contracts, then validate and authorize the resulting structured operation on the server. Deterministic routing is allowed only when based on an explicit, validated structured field rather than natural-language text.
- Models must never generate or execute free-form SQL. Data reads are available only through registered templates in `ai_agent_query_registry`, each with a stable code and version, parameter schema, named permission, server-derived scope, field redaction, and result limit.
- Revalidate parameters, conversation/user ownership, and authorization immediately before each template query. Redact and bound results before they reach the model, chat history, logs, or observability services. For missing parameters, create a persisted pending query and revalidate ownership, expiry, template validity, authorization, and target state on continuation.
- Audit every executed query with the requester, template code and version, non-sensitive parameter summary, authorization outcome, result count, and duration. Never store raw results or sensitive parameters.
- New templates require tests for allowed and denied authorization, parameter validation, redaction, bounds, and multi-turn parameter completion; add scope tests for tenant-scoped data.
- AI must not directly execute destructive or security-sensitive mutations. It may only create a persisted proposal through `ai_agent_action_registry`. Confirmation must revalidate conversation ownership, authorization, proposal status and expiry, and current target state before invoking the registered executor.
- Every new action requires a stable action code, named permission, safe target summary, `prepare` logic, and executor. Use the existing generic confirmation API and approval strip above the assistant input. Model text or Markdown is never an authorization channel.
- For WeCom message templates, AI tools may expose only authorized template discovery, parameter validation/render preview, and a confirmed send proposal. Reuse `wecom_message_template_service`; never expose Webhook URLs, encrypted credentials, API keys, or internal model fields to the model. Sending must use the internal service path, accept template ID plus structured parameters and runtime mention lists, enforce `wecom-templates:read`/`wecom-templates:send`, and require persisted confirmation before the external request. Template creation, editing, deletion, Webhook changes, media operations, and direct test sends remain management UI operations unless separately approved with the same action and audit requirements.
- Every AI-exposed domain capability must define its structured input/output schema, missing-parameter behavior, redaction rules, permission code, audit metadata, and allow/deny regression tests before registration. Preview/query tools must be side-effect free; external sends and other mutations must be represented as actions rather than ordinary tools.

## 7. Tooling and Verification Commands

### 7.1 Environment and Commands

- Use Node.js `>= 24.12.0` and pnpm `11.9.0`; do not mix npm or yarn into the workspace.
- Follow the repository RTK convention for shell commands: prefix commands with `rtk`.
- Root scripts: `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm format`, and `pnpm typecheck`.
- Backend scripts: `pnpm --dir apps/backend typecheck`, `lint:check`, `test`, and `exec node ace migration:status`.
- Frontend scripts: `pnpm --dir apps/frontend typecheck`, `lint:check`, `test`, and `build`.
- `lint` and `format` write files by default. Use `lint:check` for verification, and confirm that the scope of formatting or auto-fixes belongs to the task before running them.

### 7.2 Minimum Verification Matrix

| Change type                                                  | Minimum verification                                                                            |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Frontend view, component, route, or locale                   | frontend `typecheck`, `lint:check`; add `build` for templates, routes, or component composition |
| Backend controller, validator, model, service, or middleware | backend `typecheck`, `lint:check`, and focused or full `test`                                   |
| Migration or schema                                          | migration status, backend `typecheck`, and a persistence test when behavior changes             |
| Authentication, authorization, credential, or secret flow    | backend allow and deny tests                                                                    |
| Shared component or cross-app contract                       | Verification for every affected app plus `git diff --check`                                     |

- Add focused regression tests for bugs and high-risk behavior.
- Verification must match the affected layer and risk. Never describe an unrun, failed, or blocked command as passing.

## 8. Delivery and Reporting

The final summary must state:

1. Implemented behavior and key files.
2. Verification commands actually run and their results.
3. Every verification that was not run, failed, or was blocked, with the reason.
4. Any exception, its technical rationale, impact, and removal path.
5. Update `README.md` when a change affects documented setup, environment variables, Docker, migrations, API behavior, or template capabilities.
