# API Starter Kit Project Constraints

This is the shared engineering standard for the pnpm/Turborepo monorepo. Nested
`AGENTS.md` files add rules for their application and must not weaken these
requirements.

- `apps/backend`: AdonisJS 7, Lucid, Bouncer, Vine, and OpenAPI.
- `apps/frontend`: Vue 3 management app and shared assistant UI.
- `apps/assistant-web`: standalone Vue assistant client.
- `apps/assistant-desktop`: Tauri shell for the assistant client.
- `apps/assistant-extension`: Chrome MV3 side panel reusing assistant-web and frontend.
- `apps/authenticator-mobile`: Capacitor TOTP app.

## 1. Rule Priority And Enforcement

1. System instructions and explicit user requirements take precedence.
2. This root file owns shared project rules. Nested `AGENTS.md` files may add
   scoped requirements; `CLAUDE.md` and other entry points only point to them.
3. `must`, `never`, and `only` are mandatory. Document exceptions with their
   rationale, impact, and removal path.
4. Before editing, read the root and closest `AGENTS.md`, then inspect adjacent
   modules, shared primitives, tests, and API contracts.
5. Reuse the existing architecture and contracts. Do not create a parallel
   implementation for a page, endpoint, or shared capability.

## 2. Security, API, And Data Rules

### Backend Authority And API Contracts

- `apps/backend` is the sole authority for authentication, authorization,
  validation, persistence, and API contracts. The frontend is never a security
  boundary.
- Declare URLs, middleware, and controller targets in
  `apps/backend/start/routes.ts`. Business APIs live under `/api/v1`.
- Validate every request with Vine before reading or mutating data.
- Return only required fields through `serialize()`, transformers, or explicit
  DTOs. Never expose model internals, hashes, tokens, encrypted values, or pivot
  data by default.
- Successful endpoints use the `{ data: ... }` envelope; paginated lists put
  `items` and `meta` within `data`.
- Public API changes update OpenAPI decorators, frontend client types, and
  tests. Response-shape changes update all affected clients and tests.
- Use `401` for unauthenticated, `403` for unauthorized, `409` for referenced
  records or conflicts, and `422` for validation failures.
- Potentially unbounded lists require server-side pagination and limits.
- Define ownership, authorization, conflict behavior, and audit-sensitive
  side effects before mutations. Credential generation, encryption, and
  external-provider calls belong in services.

### Authentication, Authorization, And Sensitive Data

- Treat browser-supplied roles, permissions, IDs, and state as untrusted.
  Protected APIs use `middleware.auth()` and the narrowest named
  `middleware.permission([...])`.
- Authorize through Bouncer's `access` ability, not controller-local checks.
- Declare stable `resource:action` permission codes in
  `apps/backend/app/services/permission_catalog.ts`. Roles compose permissions;
  users receive them through roles.
- Every new navigable page or menu has its own least-privilege read permission.
  Bind the same code to the permission catalog, frontend `route.meta.permission`,
  and backend route middleware. Add/update the system permission migration and
  allow/deny tests. Do not reuse `dashboard:view` for a distinct capability.
- `super-admin` is a protected bootstrap role. Do not assign it or change its
  membership through management UI/API. Reuse `super_admin_access` and protect
  against locking out the last administrator; add lockout tests when changing
  this behavior.
- Route `meta.permission` drives navigation, route protection, and visibility.
  Use `usePermission()` for action-level affordances; frontend checks never
  replace backend authorization.
- API keys, passwords, and recovery codes are disclosed only once through
  established secure services. Never log, persist in browser state, or return
  them from ordinary reads or later updates.
- Confirm security-sensitive and irreversible operations.

### Database And Migrations

- Never edit an applied migration. Add a migration for every schema or data
  change; define foreign keys, uniqueness, indexes, and delete behavior
  deliberately.
- Check status only against the intended local environment with
  `pnpm --dir apps/backend exec node ace migration:status`.

## 3. Product And Development Workflow

### Greenfield Product Boundary

Treat projects built from this starter as greenfield unless the user says they
are existing products. The starter supplies system capabilities, not a default
business domain.

- Start from the user's product idea, entities, workflows, and success
  criteria. Dashboard, template, demo routes, navigation groups, and sample
  content are scaffolding, not product requirements.
- For a new product, replace the starter landing page in the same change. Update
  redirects, post-auth destinations, route names, permissions, navigation,
  breadcrumbs, locale keys, and tests that assume the demo dashboard.
- Remove unused user-facing demo routes and navigation. Reusable primitives and
  examples may remain as non-routed references.
- Design navigation around product tasks. Keep system administration separate;
  do not put business capabilities under `Templates`, `Examples`, or demo
  groups.
- Do not plan generic dashboard, analytics, workflow, wizard, or template work
  unless requested. Keep business code in user-defined feature modules.
- A new product is incomplete while its authenticated shell or default route
  still exposes starter dashboard content or demo navigation.
- Before proposing files, routes, permissions, or data models for a new
  capability, determine whether it is a system capability or a user-defined
  business capability.

### Before And During Changes

Before editing:

1. Identify the applicable page, API, security, or data contract.
2. Find a comparable implementation.
3. Identify files, modules, and cross-application impact.
4. List applicable verification commands.
5. Check worktree changes and preserve user work.

Keep changes focused. Reuse existing components, services, composables,
clients, registries, and test patterns. For larger tasks, report progress at
meaningful checkpoints. Before expanding across application contracts, routes,
permissions, databases, shared components, AI registries, or external systems,
state the impact. Do not mix unrelated refactors, formatting, or dependency
upgrades into a task.

Pause for confirmation when new permissions or external authorization are
required; scope or product behavior would materially expand; an irreversible or
high-risk action is needed; an important product choice cannot be inferred; or
verification requires an out-of-scope fix. Ordinary reversible code edits and
related local verification do not require step-by-step approval.

## 4. Application-Scoped Rules

Read the closest application `AGENTS.md` for implementation requirements:

- Frontend pages, forms, shared components, accessibility, VueUse, and styles
  used by the extension: `apps/frontend/AGENTS.md`.
- Backend module boundaries, persistence, credentials, tests, and AI runtime:
  `apps/backend/AGENTS.md`.
- Standalone assistant client: `apps/assistant-web/AGENTS.md`.
- Tauri window and native integrations: `apps/assistant-desktop/AGENTS.md`.
- Chrome MV3 permissions and shared runtime: `apps/assistant-extension/AGENTS.md`.

## 5. Cross-Cutting AI Boundaries

- Persist complete conversation history; context compression affects model
  requests only.
- Use the existing tool, query, and action registries. Do not create parallel
  AI clients, routes, orchestration loops, or registries.
- Do not use keyword/substring/regex matching for natural-language intent. Do
  not generate or execute free-form SQL; reads use registered query templates
  with server-side authorization, scope, limits, redaction, and audit.
- AI must not directly execute destructive or security-sensitive mutations.
  Use persisted proposals and the shared confirmation flow; revalidate
  ownership, authorization, expiry, and current target state before execution.
- Model text, Markdown, browser state, and chat history are never authorization
  channels. Redact and bound data before it reaches models, logs, or telemetry.
- Cover allowed and denied authorization, validation, redaction, bounds, and
  confirmation behavior with regression tests.

Detailed AI query/action contracts and implementation ownership are in
`apps/backend/AGENTS.md`.

## 6. Tooling And Verification

- Use Node.js `>= 24.12.0` and pnpm `11.9.0`; do not mix npm or yarn into the
  workspace. Prefix shell commands with `rtk`.
- `lint` and `format` write files. Use `lint:check` and `format:check` for
  verification, and keep formatting/fixes within task scope.
- Exact workspace and app commands are maintained in `docs/development.md` and
  package scripts.

| Change type                                                  | Minimum verification                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Frontend view, component, route, or locale                   | Frontend typecheck and lint; add build for templates, routes, or composition changes |
| Backend controller, validator, model, service, or middleware | Backend typecheck, lint, and focused or full tests                                   |
| Migration or schema                                          | Migration status, backend typecheck, and a persistence test when behavior changes    |
| Authentication, authorization, credentials, or secrets       | Backend allow and deny tests                                                         |
| Shared component or cross-app contract                       | Verify every affected app and run `git diff --check`                                 |

Add focused regression coverage for bugs and high-risk behavior. Verification
must match the affected layer and risk; never report an unrun, failed, or
blocked command as passing.

## 7. Delivery And Reporting

### Documentation Ownership

- **Documentation is a record of current state only.** Do not write change
  history, implementation timelines, task summaries, or acceptance results in
  authoritative docs. Keep release history only in the generated
  `CHANGELOG.md` and reusable validation steps in verification guides.
- Keep the root `README.md` as a concise public entry point. Put operational
  setup, deployment, security, API, and feature detail in the relevant
  authoritative document under `docs/`.
- Update authoritative documentation when documented setup, environment
  variables, Docker, migrations, API behavior, or template capabilities change.
- Feature documents describe current user-visible behavior. Keep implementation
  details only when they help maintain or operate the system.
- Do not add development logs, task summaries, or commit-specific notes to the
  root README.

The final summary states what changed and where, the verification commands and
results, any verification not run/failed/blocked and why, and exceptions with
their rationale, impact, and removal path.
