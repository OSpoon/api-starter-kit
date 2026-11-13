# Assistant Extension Addendum

Follow the repository-level `AGENTS.md`, `../frontend/AGENTS.md`, and
`../assistant-web/AGENTS.md`. Cross-application UI, security, API, and shared
runtime rules are owned by those files.

This package owns the Chrome MV3 manifest, side-panel lifecycle, connection
screen, and extension build configuration. Reuse the assistant Web app for
conversation UI, authentication, locale, and API behavior. The extension only
requests access to the configured API origin when the user connects; do not
add active-tab access, content scripts, or page-content collection.

## Shared Runtime

The extension bundles modules from `apps/assistant-web` and `apps/frontend`.
pnpm can resolve separate physical `vue-router` instances even when versions
match, so the router provider and `useRoute()`/`useRouter()` consumers must use
the same module instance.

- Keep the `vue-router` alias in `extension.config.js` pointed at the
  assistant-web runtime entry.
- Keep AutoImport enabled for plain JS/TS modules as well as Vue SFCs; generated
  type declarations do not provide runtime imports.
- Do not remove or narrow either setting without verifying that production
  extension route and store modules use the shared runtime.

Shared assistant component styles are governed by
[`apps/frontend/AGENTS.md`](../frontend/AGENTS.md). Changes to extension
configuration require the extension typecheck and production build. For shared
style changes, use the verification steps in the frontend addendum. Commands
are listed in `docs/development.md`.
