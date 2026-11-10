# `@api-starter-kit/ai-agent`

Provider-neutral Agent, tool, event, control, and session-state contracts for
backend integrations. The current Pi engine is available from
`@api-starter-kit/ai-agent/pi`.

Tool parameters use JSON Schema, and trace snapshots use the package's
`AgentTrace` contract. Engine adapters translate provider-specific schemas and
telemetry before exposing them to the backend.

The backend owns model credentials, prompts, authorization, audit, business
tools, persistence, and public APIs. An engine adapter owns only its Agent
runtime and maps its native hooks and events to the package contracts.

`src/index.ts` is the engine-neutral entry point. The `./pi` subpath exposes
only the Pi engine; its runtime helpers stay private to the package. `tsdown`
builds both entry points and writes the package export map and declarations.
Package tests run with Vitest, while backend orchestration and API integration
tests stay in `apps/backend`. Lint follows the repository Adonis ESLint rules
and Prettier configuration.

```ts
import type { AgentEngine } from '@api-starter-kit/ai-agent'
import { piAgentEngine } from '@api-starter-kit/ai-agent/pi'
```

Session snapshots use `{ engineId, version, messages }`. The Pi adapter also
accepts the legacy persisted Pi message-array format.

Run `pnpm --filter @api-starter-kit/ai-agent build`, `test`, `typecheck`, or
`lint:check` from the workspace root. The package is private and is consumed
through its generated `dist` entry points.
