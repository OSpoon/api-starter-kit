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

The desktop client can connect to any HTTPS deployment that implements this
repository's `/api/v1` contract. On first launch, enter the server origin in the
connection screen; the client checks `/api/v1/health/ready` before saving it.
The address is stored locally in the desktop WebView. Changing it clears the
current login token and requires signing in again. HTTP is accepted only for
localhost/loopback development servers.

`VITE_API_URL` remains an optional release default, not a requirement. If it is
omitted, the packaged client asks for a server address on first launch. The
Tauri CSP permits HTTPS API connections and local development endpoints; keep
script and frame sources restricted when changing this policy.

The desktop login currently uses email/password and 2FA. GitHub OAuth remains
available in `assistant-web`; the desktop client hides that option until an
OAuth callback/deep-link flow can return to the native app.

Automatic updates are intentionally not enabled until the release endpoint,
signing key, and public updater key are provided.

The desktop bundle contains the production build of `apps/assistant-web`; it
does not need a local `17070` service after packaging. Build each release on a
matching supported platform and complete the platform-specific signing,
notarization, and installer publication process before distributing it.
