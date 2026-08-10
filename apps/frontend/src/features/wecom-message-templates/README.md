# WeCom message templates

This feature manages reusable WeCom webhook message templates and exposes the
template-driven send contract used by application code and external systems.

## Feature boundary

- `types.ts`: template, parameter, message-type, and runtime mention contracts.
- `api.ts`: management, internal-send, test, and cURL generation APIs.
- `WecomMessageTemplatesPage.vue`: management list and dialog orchestration.
- `components/WecomMessageTemplateForm.vue`: template form and payload extraction.
- `components/WecomMessageVisualEditor.vue`: text/Markdown editing and preview.

The feature depends on the host project only for the shared API client, auth
store, permission composable, i18n, shared UI primitives, and list/dialog
templates. It does not depend on workbench-specific components.

## Host integration

Register `WecomMessageTemplatesPage.vue` as a list route with the
`wecom-templates:read` permission and expose these action permissions:

- `wecom-templates:create`
- `wecom-templates:update`
- `wecom-templates:delete`
- `wecom-templates:test`
- `wecom-templates:send`

The backend must provide the management endpoints under
`/api/v1/system/wecom-message-templates` and the send endpoints documented in
the backend module. The external cURL example uses an API Key placeholder and
never exposes the stored Webhook URL.

## Supported message types

The current portable scope intentionally supports `text`, `markdown`, and
`markdown_v2`. Media, news, and template-card messages are left out until their
upload and provider-specific contracts are added.
