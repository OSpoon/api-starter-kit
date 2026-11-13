# Chrome AI Assistant Extension

This Extension.js package presents the existing assistant-web Vue app in a Chrome MV3 side panel. Chat UI, authentication, API calls, locale, and authorization remain shared with the Web client and backend.

## Development

```bash
pnpm --dir apps/assistant-extension dev
pnpm --dir apps/assistant-extension typecheck
pnpm --dir apps/assistant-extension lint:check
pnpm --dir apps/assistant-extension build
```

The development command opens a Chrome profile with the extension loaded. Build output is under `dist/chrome`.

## Permissions and boundaries

On first use, enter the API server origin and connect. The extension requests optional host access only for that origin; remote servers must use HTTPS, and HTTP is limited to loopback development. It does not request active-tab access, inject page scripts, or read page content.

The extension uses password and two-factor sign-in. GitHub OAuth is hidden until the client has a native callback flow. Shared styles are governed by [`apps/frontend/AGENTS.md`](../frontend/AGENTS.md), and extension runtime rules by [`AGENTS.md`](AGENTS.md). General commands are in the [development guide](../../docs/development.md).
