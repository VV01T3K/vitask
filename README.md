# vitask

A tiny full-stack well-being productivity app. Capture what you're working on, set gentle care timers, get an AI-powered boost when you complete a task, and wrap up the session feeling genuinely good.

**Vite** (the build tool) + **vita** (Latin for life) + **task** — developer tooling aesthetic fused with a genuine well-being loop. IDE crossed with a calm wellness tool: dark base, monospace accents, purposeful. Not bubbly.

## Features

- **Task list** — add, complete, and delete tasks within a session
- **Care timers** — configurable countdown timers that fire wellness nudges (Hydration, Eye Rest 20-20-20, and custom ones you create)
- **AI task hype** — every completed task triggers context-aware micro-celebration via Groq LLM
- **AI timer nudges** — when a timer fires, a streamed AI message delivers a personalized wellness reminder tailored to that timer's purpose
- **Session wrap-up** — at end of session, AI synthesizes your completed tasks, timer history, and focus time into a warm 2–3 sentence debrief
- **Light / dark theme** — full theme support with smooth circle transitions

## Demo

https://github.com/user-attachments/assets/07c69a3b-89e3-423f-822f-c182f9feb5b2

## Requirements

- For the quick Docker setup: Docker with Compose support and any package manager (pnpm, npm, bun etc)
- For local development: vite-plus, .NET 10 SDK, Node.js ≥ 24
- For the dev container: Docker + VS Code with the Dev Containers extension

## Quick Setup (Docker)

```bash
# Start both services
docker compose up
```

Frontend at `http://localhost:3000` · Backend at `http://localhost:5107`

## Local Development Setup

```bash
# 1. Set up environment
vpr --no-cache setup      # writes .env

# 2. Install JS dependencies
vp install

# 3. Start frontend (port 3000) and backend (port 5107) in parallel and openapi autogen
vpr dev
```

The backend in development mode defaults CORS to `http://localhost:3000`.

## Technical Description

### Stack

| Layer              | Technology                                     |
| ------------------ | ---------------------------------------------- |
| Frontend framework | TanStack Start (SSR, React 19)                 |
| Data fetching      | TanStack Query                                 |
| AI integration     | TanStack AI + `@tanstack/ai-groq` (Groq API)   |
| Session state      | Durable Streams (`@durable-streams/client`)    |
| Styling            | Tailwind CSS v4                                |
| Backend            | ASP.NET Core 10 Minimal APIs (.NET 10)         |
| Validation         | FluentValidation (backend) + Zod v4 (frontend) |
| Monorepo tooling   | pnpm workspaces, vite-plus (`vpr`)             |

### Interesting Design Decisions

**OpenAPI → Orval code generation** — the C# backend generates an OpenAPI spec (`apps/backend/openapi/backend.json`). Orval reads it and generates TanStack Query hooks and Zod schemas into `shared/backend-api/gen/`. The frontend imports only from `@vitask/backend-api` — no hand-written fetch code, no duplicated types.

**Runtime response validation** — Orval is configured with `runtimeValidation: true`, so every API response is validated against its Zod schema at runtime, not just at compile time. If the backend changes, errors show up immediately instead of silently breaking the UI.

**TanStack Form pipes through the server schema** — form schemas use generated constants for user-facing error messages, then call `.transform().pipe(model.*)` to validate the final shape before submission. The form's output type is always in sync (to some degree) with what the server expects.

**Session events via Durable Streams** — AI nudge messages and task hype responses are stored as typed events in a durable stream during the session. The wrap-up function reads all events to write a personal debrief rather than just counting stats.

**SSR/CSR URL resolution** — `api-base.ts` picks a different backend URL depending on where the code runs: server-side it uses `BACKEND_URL` (the internal Docker network), client-side it reads from `window.__APP_CONFIG__` (injected at render time from `PUBLIC_BACKEND_URL`). The same generated client works correctly in both contexts.

## AI Tooling

Different tools were used for different concerns throughout development:

- **Gemini** — rapid-fire product ideas early on; later used to refine the runtime AI system prompts
- **Claude** (design) — initial product design
- **Claude** (code) — frontend UI/UX implementation, component structure, styling, and visual iteration
- **OpenAI Codex** — helped implement main application logic
- **MiniMax 2.5** — smaller, self-contained or very repetitive tasks

At runtime, the app uses **Groq** (`openai/gpt-oss-120b`, falling back to `llama-3.3-70b-versatile`) via `@tanstack/ai-groq`.

<details>
<summary>Commands</summary>

```bash
vp install      # install dependencies
vpr dev          # start frontend + backend dev servers + orval watcher
vpr check        # run checks across all packages
vpr fix          # run autofixes across all packages
vpr gen          # regenerate OpenAPI -> Orval output
vpr setup        # write .env from template
```

</details>

<details>
<summary>Project Structure</summary>

```text
.
├── apps/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── Program.cs       # service registration, middleware, CORS
│   │   │   ├── Database.cs      # EF Core context + in-memory SQLite
│   │   │   ├── TasksApi.cs      # /tasks endpoints
│   │   │   └── TimersApi.cs     # /timers endpoints
│   │   └── openapi/             # generated OpenAPI spec (consumed by Orval)
│   └── frontend/
│       └── src/
│           ├── components/      # shared UI components
│           ├── functions/       # server functions (AI hype, nudge, wrap-up)
│           ├── hooks/           # animations, timer alerts, typewriter
│           ├── integrations/    # Durable Streams + TanStack Query/Form/AI
│           ├── lib/             # timer state machine, formatting, appearance
│           └── routes/
│               ├── index.tsx            # landing page
│               └── dashboard/
│                   ├── index.tsx        # dashboard route
│                   └── -components/     # tasks, timers, modals etc
├── shared/
│   └── backend-api/             # Orval-generated hooks + Zod schemas
├── docker/                      # Dockerfiles + compose.yaml
└── .devcontainer/               # dev container config
```

</details>
