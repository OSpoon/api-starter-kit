# Frontend Addendum

Follow the repository-level `AGENTS.md` first. This file adds frontend-specific enforcement.

## Page Planning Contract

Before adding or changing a product page, inspect a comparable existing page,
declare the route `meta.pageKind`, and select its root primitive before writing
markup. Page kinds are a planning and review contract, not a runtime feature.

| Intent                  | `meta.pageKind` | Required root primitive                |
| ----------------------- | --------------- | -------------------------------------- |
| CRUD or management list | `list`          | `ListPage` and `DataTable`             |
| Resource detail         | `detail`        | `DetailPageTemplate`                   |
| User or product setting | `settings`      | `SettingsPageTemplate`                 |
| Overview or KPI landing | `dashboard`     | `DashboardPageTemplate` or `PageShell` |
| Multi-step flow         | `wizard`        | `WizardPageTemplate`                   |
| Process work            | `workflow`      | `WorkflowPageTemplate`                 |
| Reporting               | `analytics`     | `AnalyticsPageTemplate`                |
| Authentication          | `auth`          | `CardPageShell`                        |
| Domain-specific utility | `utility`       | `PageShell`                            |

A product page has exactly one root page primitive. Do not create a competing
page header, toolbar, list surface, or dialog host in a view. Route metadata is
the single source of truth for title, navigation, permission, and page kind.

For new domain work, place reusable domain UI under
`features/<feature>/components`, API calls under `features/<feature>/api.ts`,
and page-local orchestration in the feature page. `components/common` and `lib`
remain cross-domain only.

## Agent Preflight And Reference Implementations

Before changing a frontend product surface, record the answers to these
questions in the task plan or implementation summary:

1. What is the route's `meta.pageKind`, root page primitive, and route-level
   permission?
2. Which existing page is the comparable implementation?
3. Which shared component owns the page shell, list/table, form dialog,
   confirmation, and empty/loading/error feedback?
4. Which locale keys, action permissions, and desktop/mobile states change?
5. Which verification commands from the repository `AGENTS.md` apply?

Use these pages as the first reference instead of inventing a parallel pattern:

| Need                                                     | Reference implementation                             |
| -------------------------------------------------------- | ---------------------------------------------------- |
| Management list, table, create/revoke dialogs            | `src/views/ApiKeysView.vue`                          |
| RBAC list and permission assignment                      | `src/views/AccessControlView.vue`                    |
| User settings, compact centered content, security states | `src/views/ProfileView.vue`                          |
| Analytics data presentation                              | `src/views/AnalyticsTemplateView.vue`                |
| Feature-owned utility page                               | `src/features/operations/OperationsTemplatePage.vue` |

Do not copy a reference page wholesale. Reuse its shared primitives and retain
only the domain-specific content required by the new route.

## Mandatory Reuse

- Use `components/common/ListPage.vue` for every CRUD or management list page. Do not recreate its page header, refresh/create actions, framed list surface, or dialog placement in a view.
- Use `components/common/DataTable.vue` for tabular data. Do not build page-specific table markup when the shared table supports the requirement.
- Use `components/common/PageShell.vue` only for non-list pages. Do not pair it with a hand-written CRUD toolbar or a hand-written list container.
- Use `components/common/ConfirmDialog.vue` for destructive or security-sensitive confirmations.
- Use `components/common/PermissionTransfer.vue` for assigning a role's permissions. Do not implement a page-specific tree, flat checkbox list, or alternate transfer control.
- Use `components/common/FormDialogContent.vue` and `FormDialogFooter.vue` for standard form dialogs when their structure applies.
- Give every input, textarea, select, and combobox a visible `Label` with an explicit association where the control supports it. Placeholders are examples or hints only and must never be the field label.
- Use the shared browser-preference helpers for persisted UI state. Do not introduce one `localStorage` key per component or per preference.
- Add locale keys for every user-visible string. Do not use hard-coded product text in views.

## Extension Rule

Before adding page-local layout or control markup, extend the relevant shared component when the behavior is reusable. A page-specific implementation is acceptable only for genuinely domain-specific content and must not duplicate an existing shared component's responsibilities.

## VueUse Composable Priority

`@vueuse/core` is the first-choice composable library for frontend
cross-cutting behavior. Before implementing a new composable or writing
manual lifecycle, browser API, event-listener, timer, debounce/throttle,
storage, media-query, viewport, focus, clipboard, or async-state logic, check
the installed VueUse API and reuse the closest composable when it covers the
behavior. Prefer VueUse composables such as `useEventListener`,
`useTimeoutFn`/`useIntervalFn`, `useDebounceFn`, `useStorage`, and
`useClipboard` over equivalent local helpers.

When VueUse does not provide the required behavior, implement the smallest
feature-owned composable that fits the existing architecture. Document the
reason in the implementation summary when a custom implementation replaces or
closely resembles a VueUse capability. Do not add a parallel utility merely
because a local implementation is familiar; preserve existing security,
cleanup, cancellation, SSR, and browser-support requirements when adopting
VueUse.

## shadcn-vue Component Baseline

Treat `src/components/ui` as the frontend's owned shadcn-vue primitive layer.
Check it and the official shadcn-vue catalog before writing any control,
overlay, feedback, navigation, or data-display primitive. Reuse the installed
component first; do not create a page-local equivalent or silently substitute a
native/third-party control. Install missing primitives with the configured
shadcn-vue CLI and preserve the generated component contract.

Use Popover + Calendar/Range Calendar for date pickers, ListPage + DataTable
for management tables, and Sonner (`vue-sonner`) for notifications. Do not add
the deprecated Toast component. New reusable variants belong under
`src/components/ui` or the owning common/feature component, with an explicit
exception documented when shadcn-vue cannot satisfy the requirement.
