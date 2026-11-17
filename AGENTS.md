## Development

use vpr (pnpm under the hood)

Never change staged state

Layout: `apps/web` (Vite + React SPA), `apps/worker` (Cloudflare-style Worker with one Durable Object per user, run
on celld), `packages/protocol` (zod contract: domain, HTTP API, WebSocket messages), `packages/coach` (the AI coach
on pi-durable). The web app builds into `apps/worker/public/`, which the Worker serves as static assets.

Setup: copy `apps/worker/.dev.vars.example` to `apps/worker/.dev.vars` and set `GROQ_API_KEY`. celld must be on
PATH or in `~/.local/bin`.

- Check everything (format, lint, types; formatter and linter settings live in the root `vite.config.ts`):

```bash
vpr check
```

- Try to fix everything:

```bash
vpr fix
```

- Build (the web app into the Worker's assets):

```bash
vpr build
```

- Run the development servers (Worker on celld at :8790, web dev server at :5173 proxying `/api` and the WebSocket):

```bash
vpr dev
```

- Unit tests:

```bash
vpr test
```

- Integration test of the Worker on celld with a real model, and the browser end-to-end test (headless Playwright,
  screenshots to `apps/web/test-results/` or `E2E_SCREENSHOTS`):

```bash
vpr --filter @vitask/worker test:integration
vpr --filter @vitask/web test:e2e
```

<!-- intent-skills:start -->

## Skill Loading

Before substantial work:

- Skill check: run `npx @tanstack/intent@latest list`, or use skills already listed in context.
- Skill guidance: if one local skill clearly matches the task, run `npx @tanstack/intent@latest load <package>#<skill>` and follow the returned `SKILL.md`.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.

No installed package ships intent skills at the moment, so there are no mappings. Add them here when one does.

<!-- intent-skills:end -->
