# AI Assistant Web

`assistant-web` is the standalone, full-screen AI assistant client. It reuses the chat UI, API client, authentication, locale, and UI primitives from `apps/frontend`; authentication, authorization, persistence, and AI execution remain in `apps/backend`.

## Website embed

Create an API Key in the management app, then copy its generated script tag into the site. The same key works with API integrations and website embeds. Replace the example assistant host with the deployed `assistant-web` origin:

```html
<script async src="https://assistant.example.com/widget.js" data-api-key="id_..."></script>
```

The key is visible to site visitors and grants the full AI assistant integration capability. Use the same API Key for any supported integration; revoke it from API Key management when it should lose access. The embedding site's Content Security Policy must allow the assistant host in `script-src` and `frame-src`; the backend CORS allowlist must include the `assistant-web` origin. The `assistant-web` Nginx config allows framing only at the embed routes and keeps its other routes blocked from framing.

## Development

The root `pnpm dev` starts only the backend and management frontend. To run this client, start the backend and then:

```bash
pnpm --dir apps/assistant-web dev
```

The client listens on `http://localhost:17070` and proxies `/api/v1` to `http://localhost:13333` by default. Set `VITE_DEV_API_PROXY_TARGET` to use another development API.

## Production

Set `VITE_API_URL` before building when the API is not same-origin:

```bash
VITE_API_URL=https://api.example.com pnpm --dir apps/assistant-web build
```

For cross-origin deployments, allow the Web origin in backend `CORS_ORIGIN` and use HTTPS. The `dist/` output can be served as a static site or through the production Compose service; see the [deployment guide](../../docs/deployment.md).

The desktop app packages this same Web build. During desktop development, run assistant-web separately before starting Tauri. App commands and checks are in the [development guide](../../docs/development.md).
