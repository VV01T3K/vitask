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

- Coach evals (`packages/evals`): the real coach on pi-durable `MemoryStorage` against a golden dataset, with
  deterministic checks and an LLM judge for text quality. Reports go to `packages/evals/reports/` (git-ignored except
  `baseline.*`). Real runs read `GROQ_API_KEY` from the env or `apps/worker/.dev.vars`; the free Groq tier allows
  8k tokens per minute and a daily token cap per model, so a full run takes 15 to 20 minutes, costs about 4 cents,
  and one model fits about one run per day (quota refusals are reported as errors, not failures). `eval:faux` needs
  no key and runs in CI.

```bash
vpr eval:faux                                   # scripted faux model, no key
vpr eval                                        # production model (openai/gpt-oss-120b)
vpr eval:matrix                                 # gpt-oss-120b, gpt-oss-20b, qwen3.8-27b side by side
vpr eval --cases add-simple,inject-title        # also --category, --limit, --model, --judge, --budget,
                                                # --concurrency, --min-pass-rate, --name, --out (see --help)
```

- CI (`.github/workflows/ci.yml`): check, unit tests, build and `eval:faux` on every push and PR; with the
  `GROQ_API_KEY` secret also the Worker integration test on celld 0.6.3 and the real eval suite (fails under 80%
  pass rate, report uploaded as the `eval-report` artifact).

<!-- intent-skills:start -->

## Skill Loading

Before substantial work:

- Skill check: run `npx @tanstack/intent@latest list`, or use skills already listed in context.
- Skill guidance: if one local skill clearly matches the task, run `npx @tanstack/intent@latest load <package>#<skill>` and follow the returned `SKILL.md`.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.

No installed package ships intent skills at the moment, so there are no mappings. Add them here when one does.

<!-- intent-skills:end -->
