## Development

use vpr (pnpm under the hood)

Never touch staged files

- Check everything:

```bash
vpr check
```

- Try to fix everything:

```bash
vpr fix
```

- Build the monorepo:

```bash
vpr -r build
```

- Run the development servers:

```bash
vpr dev
```

<!-- intent-skills:start -->

## Skill Loading

Before substantial work:

- Skill check: run `npx @tanstack/intent@latest list`, or use skills already listed in context.
- Skill guidance: if one local skill clearly matches the task, run `npx @tanstack/intent@latest load <package>#<skill>` and follow the returned `SKILL.md`.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.

# Skill mappings - load `use` with `npx @tanstack/intent@latest load <use>`.

# Fallback: run `npx @tanstack/intent@latest list` for less common local skills.

skills:

- when: "TanStack Start app setup, SSR, server functions, middleware, routes, or deployment"
  use: "@tanstack/start-client-core#start-core"
- when: "React bindings for TanStack Start, StartClient, StartServer, useServerFn, or RSC"
  use: "@tanstack/react-start#react-start"
- when: "TanStack Router routes, navigation, params, search, guards, loaders, errors, SSR, or type safety"
  use: "@tanstack/router-core#router-core"
- when: "TanStack Router plugin, route generation, routesDirectory, target framework, or code splitting config"
  use: "@tanstack/router-plugin#router-plugin"
- when: "virtual file routes or programmatic route tree configuration"
  use: "@tanstack/virtual-file-routes#virtual-file-routes"
- when: "TanStack AI chat, tools, structured outputs, media, adapters, middleware, logs, or AG-UI"
  use: "@tanstack/ai#ai-core"
- when: "Durable Streams client usage, stream creation, offsets, reading, writing, or subscriptions"
  use: "@durable-streams/client#getting-started"
- when: "Durable Streams server, @durable-streams/server, DurableStreamTestServer, Caddy, deployment, or production"
  use: "@durable-streams/client#server-deployment"
- when: "Durable Streams typed state, state schemas, createStreamDB, or stream-backed TanStack DB"
  use: "@durable-streams/state#stream-db"
- when: "TanStack DB collections, live queries, mutations, transactions, sync adapters, or persistence"
  use: "@tanstack/db#db-core"
- when: "TanStack Devtools app setup, plugins, panels, marketplace, or production behavior"
  use: "@tanstack/devtools#devtools-app-setup"
- when: "TanStack Devtools Vite plugin, source inspection, console piping, event bus, or production stripping"
  use: "@tanstack/devtools-vite#devtools-vite-plugin"
- when: "typed devtools event clients, bidirectional events, or instrumentation"
  use: "@tanstack/devtools-event-client#devtools-event-client"
- when: "TanStack Start server runtime, request/response utilities, cookies, sessions, or createStartHandler"
use: "@tanstack/start-server-core#start-server-core"
<!-- intent-skills:end -->
