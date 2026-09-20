# Assistant Extension Addendum

Follow the repository-level `AGENTS.md`, `../frontend/AGENTS.md`, and
`../assistant-web/AGENTS.md`. Cross-application UI, security, API, and shared
runtime rules are owned by those files.

This package owns the Chrome MV3 manifest, side-panel lifecycle, connection
screen, and extension build configuration. Reuse the assistant Web app for
conversation UI, authentication, locale, and API behavior. The extension only
requests access to the configured API origin when the user connects; do not
add active-tab access, content scripts, or page-content collection.

Keep the Vue Router alias and plain JS/TS AutoImport settings required by the
root `AGENTS.md`. Shared assistant component styles belong in
`apps/frontend/src/assets/assistant-components.css`. Changes to extension
configuration require the extension typecheck and production build; shared
assistant changes also require the affected Web builds listed in
`docs/development.md`.
