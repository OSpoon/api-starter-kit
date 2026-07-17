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
