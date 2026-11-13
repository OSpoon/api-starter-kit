# AI Assistant Desktop

This Tauri package provides the native window and platform integrations for `assistant-web`. It does not implement a separate UI or AI runtime.

## Development and build

Start the backend, then start the Web client and desktop shell in separate terminals:

```bash
pnpm --dir apps/assistant-web dev
pnpm --dir apps/assistant-desktop dev
```

Tauri connects to the Web client at `http://localhost:17070`. The desktop package commands are `dev`, `build`, and `build:app`; its typecheck, lint, test, and format scripts run the corresponding Cargo checks. See the [development guide](../../docs/development.md).

Production builds package the assistant-web `dist/` output. An API server can be selected on first launch; the app checks `/api/v1/health/ready` before saving the origin. Remote servers must use HTTPS. Changing the origin clears the stored login token.

The packaged app supports email/password and 2FA. GitHub OAuth is hidden until a native callback flow is available. Automatic updates are not configured; releases require platform signing and distribution setup.

On macOS, the app declares the microphone usage description for voice recording. Keep Tauri permissions and the Content Security Policy limited to the integrations the app uses. Desktop constraints are in [`AGENTS.md`](AGENTS.md); shared UI and AI behavior are documented in the [assistant-web README](../assistant-web/README.md).
