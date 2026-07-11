# Frontend Addendum

Follow the repository-level `AGENTS.md` first. This file adds frontend-specific enforcement.

## Mandatory Reuse

- Use `components/common/ListPage.vue` for every CRUD or management list page. Do not recreate its page header, refresh/create actions, framed list surface, or dialog placement in a view.
- Use `components/common/DataTable.vue` for tabular data. Do not build page-specific table markup when the shared table supports the requirement.
- Use `components/common/PageShell.vue` only for non-list pages. Do not pair it with a hand-written CRUD toolbar or a hand-written list container.
- Use `components/common/ConfirmDialog.vue` for destructive or security-sensitive confirmations.
- Use `components/common/PermissionTransfer.vue` for assigning a role's permissions. Do not implement a page-specific tree, flat checkbox list, or alternate transfer control.
- Use `components/common/FormDialogContent.vue` and `FormDialogFooter.vue` for standard form dialogs when their structure applies.
- Give every input, textarea, select, and combobox a visible `Label` with an explicit association where the control supports it. Placeholders are examples or hints only and must never be the field label.
- Use the shared browser-preference helpers for persisted UI state. Do not introduce one `localStorage` key per component or per preference.

## Extension Rule

Before adding page-local layout or control markup, extend the relevant shared component when the behavior is reusable. A page-specific implementation is acceptable only for genuinely domain-specific content and must not duplicate an existing shared component's responsibilities.
