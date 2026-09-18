# AI Assistant Desktop

This package is the Tauri desktop shell for the independent AI Assistant
client. The UI and AI behavior are owned by `apps/assistant-web`; this package
only owns the native window, desktop permissions, Rust commands, and packaging.

## Commands

- `pnpm dev` from the repository root starts the Tauri window and the existing Web client on
  port `17070` together. The desktop task only connects to that Web client and never starts a
  second Web server.
- `pnpm build` builds the Web client and packages the desktop application.
- `pnpm build:app` builds the macOS application bundle without creating a DMG.
- `pnpm typecheck` runs `cargo check`.
- `pnpm lint:check` runs `cargo clippy` with warnings denied.
- `pnpm format:check` verifies Rust formatting.

The desktop app inherits the repository constraints from `../../AGENTS.md` and
the shared frontend constraints from `../assistant-web/AGENTS.md`.
The Web client details are documented in [`../assistant-web/README.md`](../assistant-web/README.md).

On macOS, `src-tauri/Info.plist` declares the microphone usage description
required by the WebView voice-recording flow. The first recording attempt will
trigger the system microphone permission prompt.

Automatic updates are intentionally not enabled until the release endpoint,
signing key, and public updater key are provided. Production builds must set
`VITE_API_URL` before running `pnpm build` or `pnpm build:app`; the Tauri CSP
must then be restricted to that API origin before publishing.

The desktop bundle contains the production build of `apps/assistant-web`; it
does not need a local `17070` service after packaging. Build each release on a
matching supported platform and complete the platform-specific signing,
notarization, and installer publication process before distributing it.
