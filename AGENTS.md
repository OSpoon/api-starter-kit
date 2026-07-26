# Project Engineering Guidelines

These rules apply to every change in this repository. Prefer the existing architecture and shared primitives over adding a parallel implementation.

## Rule Precedence And Exceptions

- System and user instructions take precedence over this file. A nested `AGENTS.md` may add stricter rules but must not weaken this file.
- Interpret `must`, `never`, and `only` as mandatory. Do not silently make an exception for speed or convenience.
- An exception requires a documented technical reason in the final change summary and must include a follow-up path to remove the exception.
- When a requirement conflicts with existing code, preserve the requirement and refactor the local code instead of copying its inconsistency.

## Required Change Workflow

1. Read the closest `AGENTS.md`, then inspect the existing module, related shared primitives, tests, and API contract.
2. Identify the applicable shared component, service, middleware, model, transformer, validator, or template before editing.
3. For cross-app, security, schema, routing, or shared-component changes, state the implementation scope before editing.
4. Keep edits narrowly scoped. Do not mix refactors, formatting churn, or dependency upgrades with an unrelated feature.
5. Verify the affected layer and all changed contracts before reporting completion.

## Agent Entry Points

`AGENTS.md` is the canonical, repository-wide instruction source for every
coding agent. Read this file and the closest nested `AGENTS.md` before
planning or editing.

- Tool-specific instruction files such as `CLAUDE.md`,
  `.github/copilot-instructions.md`, and `.cursor/rules/project-standard.mdc`
  are entry points only. They must point here rather than duplicate or weaken
  these rules.
- When an entry point and an `AGENTS.md` differ, follow the closest
  `AGENTS.md`, then report the conflict. Do not choose the less restrictive
  interpretation.
- Before starting a task, state the applicable page, API, security, or schema
  contract; name the comparable implementation; and identify the verification
  commands from this document.

## Naming And Module Boundaries

- Name files for their reusable responsibility, not their current screen or organizational domain. Prefer `ListPage` over `ManagementListPage`.
- Vue views compose page-level workflows. Reusable visual behavior belongs in `components/common`, reusable domain UI in a feature component, and shared client logic in `composables` or `lib`.
- Treat composable APIs as a frontend standard: extract stable, reusable state machines and side effects—such as loading, pagination, filters, form orchestration, API requests, and lifecycle watchers—into `composables`. Keep views focused on route-level composition and keep feature components focused on rendering and interaction. Do not create a composable solely to relocate one-off presentational markup or a single trivial computed value.
- Backend controllers coordinate request/response only. Validators own request shape, services own reusable domain logic, models own persistence relations, and transformers own output shape.
- Do not import a view into another view. Do not import a controller from another controller.
- Avoid barrel files unless the local package already establishes that pattern.

## Architecture And Ownership

- `apps/backend` owns persistence, authentication, authorization, input validation, and the authoritative API contract.
- `apps/frontend` owns presentation, client state, routing, and interaction feedback. Frontend authorization improves the experience but never replaces backend enforcement.
- Keep domain logic in services, API orchestration in controllers, and persistence concerns in models and migrations.
- Do not introduce a dependency, abstraction, or cross-app package until an existing local pattern cannot meet the need.
- Keep shared contracts explicit. When backend response shape changes, update the frontend API client and its types in the same change.

## Security And RBAC

- Treat every browser-supplied permission, role, identifier, and state flag as untrusted. Enforce authorization on the backend for every protected API operation.
- Use the project Bouncer ability and named permission middleware for API authorization. Do not add controller-local authorization checks that duplicate or bypass the shared mechanism.
- Permission codes use `resource:action` format and are stable identifiers. Declare them before using them in routes, APIs, menus, or buttons.
- Roles compose permissions; users receive roles. Effective permissions are the union of a user's roles.
- `super-admin` is a protected bootstrap role: it is not assignable through the management UI or API and its role membership cannot be changed.
- UI controls must use the shared `usePermission()` or `v-permission` capability. Hidden or disabled controls are not a security boundary.
- Never log, persist in browser state, or return a password, API key, recovery code, or other secret except through an intentional one-time disclosure flow.
- Generated credentials must use cryptographically secure randomness and be shown once with a copy action. Password resets and destructive operations require confirmation.

## Database And Migrations

- Migrations are immutable once applied. Add a new migration for every schema or data change; never edit an applied migration to repair production state.
- Separate schema creation from data seeding when the migration framework applies schema operations after `up()` completes.
- Define foreign keys, uniqueness, indexes, and delete behavior deliberately. Protect referenced roles and permissions from deletion instead of silently revoking access.
- Update generated schema artifacts only through the repository's migration tooling.
- Validate migrations with `node ace migration:status`; run migrations only against the intended local environment.
- A migration that seeds data must be idempotent or have an explicit lifecycle. Use a separate seed migration when the schema it depends on is created in the same release.

## Backend API

- Validate every request with Vine validators before using input.
- Return consistent serialized JSON shapes. List endpoints return lists; item endpoints return items; management list DTOs expose only the fields required by the UI.
- Use correct status semantics: `401` for unauthenticated, `403` for unauthorized, `409` for conflicts such as deleting referenced records, and `422` for validation failures.
- Keep controllers short. Extract password generation, encryption, ownership checks, and shared serialization into services or transformers.
- Preserve OpenAPI metadata when adding or changing public endpoints.
- Do not expose model internals, hashes, encrypted fields, tokens, or relation pivot data by default. Use explicit DTOs/transformers.
- Paginate potentially unbounded list endpoints before production use. The frontend table pagination is not a substitute for API pagination.
- Any mutation must define ownership, authorization, conflict behavior, and audit-sensitive side effects before implementation.

## AI Conversations

- Persist complete AI conversation messages. Context reduction may only affect the model request, never stored history or history APIs.
- Implement long-running conversation reduction as a rolling, persisted summary with an explicit covered-message boundary. Preserve the system prompt and recent messages in every model request.
- Context compression must be enabled by default, configurable through validated backend environment variables, and must fall back to a bounded recent-message window when summarization fails.

## AI Controlled Data Queries

- Agent Tools must never generate or execute free-form SQL. Database reads are available only through registered query templates.
- A query template owns its stable code and version, parameter schema, named permission, server-derived ownership or tenant scope, bounded result shape, row limit, and field-level redaction policy. Do not expose raw table, column, SQL, or arbitrary filter inputs to the model.
- The backend must validate every template parameter and re-check authorization immediately before each query execution. Model-supplied identifiers, scopes, and permission claims are untrusted; multi-tenant or business-data templates must derive and enforce scope on the server.
- Apply redaction and result limits before any query result reaches the model, persisted chat history, logs, or external observability service. Never return credentials, secrets, tokens, hashes, or unredacted sensitive fields through a query template.
- When required parameters are missing, persist a user- and conversation-owned pending query with its template version, collected safe parameters, missing fields, status, and expiry. On every continuation, re-check ownership, expiry, template validity, authorization, and current target state; cancel the pending query when the user selects a different template.
- Audit every executed query with the requester, template code and version, non-sensitive parameter summary, authorization outcome, result count, and duration. Do not store raw query results or sensitive parameter values in audit metadata.
- New query templates require focused tests for allowed and denied authorization, parameter validation, redaction, bounds, and multi-turn parameter completion; add tenant-scope tests whenever tenant-scoped data is introduced.

## AI Controlled Actions

- Agent Tools must never directly execute destructive or security-sensitive business mutations. They may only create a persisted action proposal.
- Every proposal records the authenticated requester, conversation, action, target type and ID, non-sensitive target summary, payload, status, expiry, and final confirmer.
- Confirm execution must re-check conversation ownership, current authorization, proposal status and expiry, and the target's current state before invoking the registered domain executor.
- Register new controlled actions in the Agent action registry with their stable action code, named permission, safe target summary, preparation logic, and executor. Reuse the shared in-assistant approval strip and generic confirmation endpoint; do not add action-specific dialogs or Markdown confirmation controls.
- The approval strip is non-blocking and appears above the assistant input after the response is complete. Its dismiss/cancel control hides the prompt only; it must not discard the persisted proposal, so an explicit approval reply can still confirm that same proposal.
- Model text and Markdown are never an authorization or confirmation channel. A normalized explicit approval reply may only select the currently pending persisted proposal; only the backend confirmation flow may invoke an executor.

## Frontend Components And UX

- Use `ListPage` for CRUD and management list pages, `DataTable` for tabular data, `ConfirmDialog` for destructive/security-sensitive confirmations, and `PageShell` only for non-list pages.
- Use `PermissionTransfer` for role permission assignment when the catalog contains multiple groups or resources. Do not recreate a page-local permission picker or fall back to a flat checkbox list.
- Extend a shared component when a behavior is reusable. Do not recreate shared headers, toolbars, tables, dialogs, filters, pagination, or page containers in a view.
- Route definitions are the single source of truth for navigation, menu visibility, breadcrumbs, titles, and route-level permissions.
- Use route `meta.permission` for protected pages and the shared permission helpers for actions. Keep menu filtering and route registration aligned with the same route metadata.
- Use Lucide icons for icon controls. Icon-only controls require an accessible label and tooltip/title.
- Every input, textarea, select, and combobox needs a visible, independent label. A placeholder is supplementary input guidance and never substitutes for a label.
- Use `FormDialogContent` and `FormDialogFooter` for standard dialog forms so headers, content spacing, and action bars match the API key form.
- Keep forms accessible: labels, validation feedback, keyboard support, disabled loading states, and confirmation for irreversible actions.
- Use locale keys for user-visible text. Do not add unlocalized hard-coded labels to product views.
- Match existing spacing, typography, component variants, and responsive behavior. Verify new pages against a comparable existing page before considering the work complete.
- Choose page structure by intent: management/list uses `ListPage`; detail uses a detail template; settings uses a settings template; wizard uses a wizard template; analytics uses an analytics template. Do not mix their shells.
- A component API should represent stable variants and slots. Do not add a prop solely to support one page's incidental markup.
- Never add a page-local table, toolbar, confirmation modal, or empty state if an existing shared component can be extended to support it.
- Persist browser state only when it materially improves repeat use. Group same-domain UI preferences under a versioned, namespaced storage key; migrate and remove retired keys instead of accumulating per-view entries. Keep authentication secrets separate from non-sensitive UI preferences.
- New user-visible controls must have complete loading, empty, error, disabled, and permission states where applicable.
- Verify desktop and mobile layouts for changed user-facing views. Text, controls, and dialogs must not overflow or overlap.

## Testing And Verification

- Add focused regression tests for bug fixes and high-risk behavior, especially authorization, authentication, credentials, migrations, and API contracts.
- Run relevant backend type checks and frontend type checks after changes. Run lint and `git diff --check` before completion.
- Run the production frontend build when changing templates, routes, or component composition.
- Do not claim a command passed when it was blocked or not run. Report the exact remaining verification gap.

### Minimum Verification Matrix

| Change type                                                  | Required verification                                                                                 |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Frontend view, component, route, or locale                   | `pnpm --dir apps/frontend type-check`, frontend lint, and frontend build for template/routing changes |
| Backend controller, validator, model, service, or middleware | `pnpm --dir apps/backend typecheck`, backend lint, and focused or full backend tests                  |
| Migration or schema                                          | migration status, backend typecheck, and a focused persistence test when behavior changes             |
| Authorization, authentication, credential, or secret flow    | backend tests covering allow and deny paths; never rely only on UI behavior                           |
| Shared component or cross-app contract                       | verification for every affected application plus `git diff --check`                                   |

## Documentation And Change Discipline

- Update `README.md` when setup, environment variables, Docker workflows, migrations, API behavior, or template capabilities change.
- Keep changes scoped to the requested behavior. Do not revert or reformat unrelated user changes.
- Do not use destructive git commands without explicit user approval.
- Before adding a new library, check whether the existing stack or installed shadcn-vue components already solve the problem.
- Update the project guidelines when a new recurring decision, invariant, or approved shared primitive is introduced.
- Final summaries must state changed behavior, key verification results, and any verification that could not run.
