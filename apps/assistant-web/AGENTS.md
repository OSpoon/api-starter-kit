# Assistant Web Addendum

Follow the repository-level `AGENTS.md` and the shared frontend rules in
`../frontend/AGENTS.md`. Those files own the cross-application security,
component, form, locale, API, and verification contracts.

This package owns the standalone assistant shell, its routes, runtime
configuration, and entry points. Shared chat UI, state, API clients, and locale
messages remain in `apps/frontend`; do not create a second implementation.

When changing a shared module that the Chrome extension also bundles, preserve
the extension style and Vue Router runtime requirements in the root
`AGENTS.md`. Repository commands and per-application checks are listed in
`docs/development.md`.
