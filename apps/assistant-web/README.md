# AI Assistant Web

`assistant-web` is the independent Web client for the AI Assistant. It provides a
full-screen conversation workspace with conversation history, voice input,
confirmation flows, usage details, login, 2FA, password-expiration handling,
and account logout.

The client does not implement a second AI stack. It reuses the AI chat
components, API client, authentication store, locale files, UI primitives, and
backend contracts from `apps/frontend`. Authentication, authorization,
conversation persistence, model calls, tool execution, and sensitive data
handling remain owned by `apps/backend`.

## Development

The recommended command from the repository root starts the complete local
stack, including this Web client and the Tauri desktop client:

```bash
pnpm dev
```

The Web client listens on `http://localhost:17070`. It proxies `/api/v1` to
`http://localhost:13333` by default. Override the proxy target when needed:

```bash
VITE_DEV_API_PROXY_TARGET=http://localhost:13333 pnpm --dir apps/assistant-web dev
```

The desktop client does not start this Vite service itself. It connects to the
existing `17070` service during development. To run only the Web client, start
the backend first and then run `pnpm --dir apps/assistant-web dev`.

## Production build

Set `VITE_API_URL` to an API origin reachable by the browser before building a
standalone deployment:

```bash
VITE_API_URL=https://api.example.com pnpm --dir apps/assistant-web build
```

When Web and API use different origins, add the Web origin to backend
`CORS_ORIGIN` and use HTTPS. The generated `dist/` directory can be hosted by
Nginx, a CDN, or another static hosting service.

The production Docker Compose stack also builds and runs this client as the
`assistant-web` service at `http://localhost:17070` by default. Its Nginx
container serves the static build and proxies `/api/` to the backend; see the
repository [deployment guide](../../docs/deployment.md) for configuration.

The Tauri desktop build consumes this same `dist/` output through
`apps/assistant-desktop` and does not create a parallel UI implementation.
Only the Tauri runtime exposes the server connection screen and runtime API
base URL override; browser deployments continue to use the same-origin default
or the build-time `VITE_API_URL`.

## Verification

```bash
pnpm --dir apps/assistant-web format:check
pnpm --dir apps/assistant-web typecheck
pnpm --dir apps/assistant-web lint:check
pnpm --dir apps/assistant-web test
pnpm --dir apps/assistant-web build
```
