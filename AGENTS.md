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

- when: "TanStack Start frontend setup, routing shell, SSR, deployment, server functions, middleware, or server routes"
  use: "@tanstack/start-client-core#start-core"
- when: "React bindings for TanStack Start, StartClient, StartServer, createStart, useServerFn, or React Server Components"
  use: "@tanstack/react-start#react-start"
- when: "TanStack Router routes, navigation, params, search params, auth guards, data loading, errors, code splitting, SSR, or route type safety"
  use: "@tanstack/router-core#router-core"
- when: "TanStack Router plugin, route generation, routesDirectory, target framework, or automatic code splitting config"
  use: "@tanstack/router-plugin#router-plugin"
- when: "virtual file routes or programmatic route tree configuration"
  use: "@tanstack/virtual-file-routes#virtual-file-routes"
- when: "TanStack AI chat, tool calling, structured outputs, media generation, adapters, middleware, debug logging, or AG-UI streaming"
  use: "@tanstack/ai#ai-core"
- when: "TanStack Devtools app setup, plugins, panels, marketplace publishing, or production devtools behavior"
  use: "@tanstack/devtools#devtools-app-setup"
- when: "TanStack Devtools Vite plugin, source inspection, console piping, event bus, editor integration, or production stripping"
  use: "@tanstack/devtools-vite#devtools-vite-plugin"
- when: "typed devtools event clients, bidirectional events, or instrumentation for debugging state and lifecycle changes"
  use: "@tanstack/devtools-event-client#devtools-event-client"
- when: "TanStack Start server runtime, request and response utilities, cookies, sessions, createStartHandler, or AsyncLocalStorage context"
use: "@tanstack/start-server-core#start-server-core"
<!-- intent-skills:end -->

## Development

use vpr (pnpm under the hood)

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
