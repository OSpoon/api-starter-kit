# Frontend Addendum

Follow the repository-level `AGENTS.md` first. This file owns frontend page,
component, form, locale, and shared assistant style rules.

## Page And Route Contract

Before writing page markup, inspect a comparable page, identify the route
`meta.pageKind`, its root primitive, and its route permission. Record these
decisions in the task plan or implementation summary.

| Intent                  | `meta.pageKind` | Required root primitive                |
| ----------------------- | --------------- | -------------------------------------- |
| CRUD or management list | `list`          | `ListPage` + `DataTable`               |
| Resource detail         | `detail`        | `DetailPageTemplate`                   |
| User or product setting | `settings`      | `SettingsPageTemplate`                 |
| Overview or KPI landing | `dashboard`     | `DashboardPageTemplate` or `PageShell` |
| Multi-step flow         | `wizard`        | `WizardPageTemplate`                   |
| Process work            | `workflow`      | `WorkflowPageTemplate`                 |
| Reporting               | `analytics`     | `AnalyticsPageTemplate`                |
| Authentication          | `auth`          | `CardPageShell`                        |
| Domain utility          | `utility`       | `PageShell`                            |

A product page has exactly one root page primitive. Route metadata is the
single source of truth for title, navigation, breadcrumbs, permission, and page
kind. Route-level orchestration belongs in the view; reusable domain UI belongs
in `features/<feature>/components`, API calls in
`features/<feature>/api.ts`, and cross-domain UI in `components/common` or
`components/ui`.

## Planning And Reference Pages

Before changing a frontend product surface, record:

1. The route's `meta.pageKind`, root primitive, and route-level permission.
2. The comparable existing page.
3. The shared components that own the shell, table, dialogs, confirmation, and
   loading/empty/error feedback.
4. The locale keys, action permissions, and desktop/mobile states affected.
5. The applicable verification commands from the root `AGENTS.md`.

| Need                                   | Reference                                            |
| -------------------------------------- | ---------------------------------------------------- |
| Management list, create/revoke dialogs | `src/views/ApiKeysView.vue`                          |
| RBAC and permission assignment         | `src/views/AccessControlView.vue`                    |
| Settings and security states           | `src/views/ProfileView.vue`                          |
| Knowledge feature organization         | `src/features/knowledge/KnowledgeDocumentsPage.vue`  |
| Analytics page                         | `src/views/AnalyticsTemplateView.vue`                |
| Workflow or wizard page                | The corresponding `*TemplateView.vue`                |
| Feature-owned utility page             | `src/features/operations/OperationsTemplatePage.vue` |

Do not copy a reference page wholesale. Reuse its primitives and retain only
the domain-specific content required by the route.

## Shared Page And List Components

- Use `components/common/ListPage.vue` and `DataTable.vue` for CRUD and
  management lists. Use `PageShell.vue` only for non-list pages.
- `ListPage` owns the title and description, refresh action, permission-gated
  primary action, content surface, and dialog placement.
- `DataTable` owns search, filters, column visibility, table surface, empty
  state, and pagination. Do not add a second search box, filter toolbar, table
  wrapper, or pagination block in the view.
- Use `DataTable`'s `filters` slot for row filters. Keep compact search and
  filters in one responsive row with `filters-layout="inline"` when supported.
  Otherwise let the shared filter row wrap. Use `ListPage`'s `query` slot only
  for page-level queries outside the table filter row, and its `operations`
  slot for secondary or bulk actions on the current list. Global page actions
  remain in the `ListPage` header.
- Put row actions in the rightmost table column. Gate each action with
  `usePermission()` and confirm destructive or security-sensitive actions with
  `ConfirmDialog`.
- All icon controls use Lucide and provide an accessible name plus a tooltip or
  title.
- Put secondary page actions after refresh and the primary action. When there
  are more than three actions, keep the most frequent actions visible and put
  the rest in the shared `ButtonGroup`/`DropdownMenu` overflow pattern, with
  locale labels, permission checks, disabled/loading states, and accessible
  names. Extend the shared page action slot instead of making a page-local
  overflow implementation.
- Potentially unbounded data uses server pagination. Refresh, create, filter,
  row actions, pagination, loading, empty, error, disabled, and denied states
  must preserve the shared layout without overlap.

## Forms, Interactions, And API Calls

Use the typed `vee-validate` + Zod pattern with `toTypedSchema`, `useForm`,
`FormField`/`FormControl`, `FormMessage`, and `firstFormError`. Backend Vine
validation remains authoritative; do not use native `required`, ad hoc
validation, or a page-local form library.

Standard create/edit dialogs follow
`src/components/workbench/ApiKeyForm.vue`:

- Use `FormDialogContent` with a form using
  `flex min-h-0 flex-1 flex-col overflow-hidden`, a separate scrolling body using
  `min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto`, and
  `FormDialogFooter`. Keep the body and field grid separate.
- Use ordinary `FormMessage` without fixed height, placeholder content, or
  reserved space. Validation errors grow their current row naturally.
- Multi-column grids use `items-start`. Use wrappers for explicit column spans;
  each `FormItem` stays top-aligned. Long descriptions, credentials, editors,
  and JSON fields span the full responsive row.
- Collapse multi-column layouts on narrow screens. Compact fields may share a
  row only while each field remains top-aligned.
- Set `:validate-on-blur="false"` on every `FormField`. Submit with
  `form.handleSubmit`; show `firstFormError` in the invalid callback. Preserve
  change and model-update validation after failed submission.
- Use shared `Select` primitives without page-local positioning or portal
  overrides. Select content stays in the page-level portal, outside transformed
  dialog containers.
- Cover saving, disabled controls, backend validation errors, cancellation, and
  success feedback. Sensitive values follow one-time disclosure rules and
  never enter browser state or logs.

Every visible string uses locale keys. Each input, textarea, select, or
combobox needs an independent visible label, explicitly associated where the
control supports it; a placeholder is only a hint. Use `@/lib/api` and its
`ApiError`/Bearer-token conventions. Frontend visibility never replaces backend
authorization. Persist only non-sensitive preferences that materially improve
repeat use through the shared versioned and namespaced browser-preference
helpers. Keep reusable request, loading, pagination, filtering, and lifecycle
state in
composables; do not extract one-off presentation logic.

Use `ConfirmDialog.vue` for destructive or security-sensitive confirmation,
`PermissionTransfer.vue` for role permission assignment, and
`FormDialogContent.vue`/`FormDialogFooter.vue` for standard forms. A confirmation
button only emits `confirm`; the caller controls closing and async loading.

Before considering a new page complete, compare it with the selected reference
at desktop and narrow widths. Confirm the route contract and permissions,
shared placement of search/filters/actions/dialogs, consistent loading/empty/
error/disabled/unauthorized/validation states, locale and accessibility
patterns, and the applicable typecheck/lint/build/focused tests.

## shadcn-vue Component Governance

`src/components/ui` is the owned shadcn-vue primitive layer. Check it and the
official catalog before adding controls, overlays, feedback, navigation, or
data-display primitives. Reuse installed components; do not add page-local
copies or silently substitute native/third-party controls.

The baseline includes Calendar, Carousel, Drawer, Attachment, Bubble, Marker,
and Message in addition to the core catalog. Date pickers use Popover plus
Calendar/Range Calendar; management tables use ListPage plus DataTable; notices
use Sonner (`vue-sonner`), not the deprecated Toast.

Install missing components with the configured registry, from `apps/frontend`:

```bash
pnpm dlx shadcn-vue@latest add <component>
```

Commit generated source and direct dependencies. Use `--overwrite` only when
intentionally synchronizing a primitive, and verify public props and consumers.
Put reusable behavior in `components/ui` or the owning common/feature component,
not inline in a view. Document exceptions with their reason, scope, and removal
path.

## VueUse Composable Priority

Check `@vueuse/core` before implementing cross-cutting lifecycle, browser API,
event, timer, debounce/throttle, storage, media-query, viewport, focus,
clipboard, or async-state behavior. Prefer its composables when they cover the
need. Otherwise implement the smallest feature-owned composable and preserve
security, cleanup, cancellation, SSR, and browser support.
When a custom composable replaces or closely resembles a VueUse capability,
record why it is needed in the implementation summary.

## Shared Styles Used By The Chrome Extension

The standalone assistant and extension bundle shared Vue components from this
app. Until Extension.js/Rspack reliably includes Vue SFC styles in production:

- Put styles for extension-reachable components in
  `src/assets/assistant-components.css`, imported once by `src/assets/main.css`.
- Do not add `<style>`, `<style scoped>`, or `<style src>` blocks to components
  reachable from the extension.
- Prefix selectors with the component's unique root/class namespace and scope
  descendant rules where possible. Do not add broad element selectors or generic
  classes.
- Do not duplicate these rules in assistant-web or extension stylesheets.
- For style changes, build the extension, assistant-web, and frontend for
  production, then confirm representative selectors appear in emitted extension
  CSS. A successful JavaScript build alone is insufficient.

Remove this exception only after a production extension build packages the
expected component styles without dead virtual CSS references.
