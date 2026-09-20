# Chrome AI Assistant Extension

This workspace package presents the existing AI Assistant in a Chrome MV3 side
panel. Extension.js owns the extension build and browser integration; the UI,
authentication, conversation API, locale messages, and backend contracts are
reused from `apps/assistant-web` and `apps/frontend`.

The extension opens from the Chrome toolbar. On first use, enter the API server
origin and connect. Chrome asks for access to that server only when connecting;
remote servers must use HTTPS, and HTTP is accepted only for loopback
development servers. The extension does not inject scripts into pages or read
the active tab's title, URL, or content.

## Development

Install dependencies from the repository root with `pnpm install`, then run:

```bash
pnpm --dir apps/assistant-extension dev
pnpm --dir apps/assistant-extension build
pnpm --dir apps/assistant-extension typecheck
pnpm --dir apps/assistant-extension lint:check
pnpm --dir apps/assistant-extension format:check
```

`dev` opens an isolated Chrome development profile with the extension loaded.
`build` type-checks and emits a Chrome package under `dist/chrome`.

## Architecture boundary

- Extension.js owns the Chrome MV3 manifest, side-panel lifecycle, and package
  build.
- The extension mounts the same Vue app as `apps/assistant-web`, with
  hash-based routing for the `chrome-extension://` origin.
- The shared app uses the existing frontend AI components, API client,
  authentication store, locale messages, and backend contracts. It does not add
  another chat protocol or move authorization into the extension.
- `sidePanel` is required. API host access is optional and requested for the
  configured server origin from the connection form. No page scripts or active
  tab permissions are used.
- The extension uses password and two-factor sign-in. GitHub OAuth remains
  hidden, matching the desktop client's current behavior.
