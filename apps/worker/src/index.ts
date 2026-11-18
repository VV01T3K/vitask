import { PROTOCOL_VERSION, WS_PATH } from "@vitask/protocol";

import { accountsFor, createAuth, type Auth, type AuthSettings } from "./auth.ts";
import { applyDevMigrations } from "./dev-migrations.ts";
import { authSettingsFromEnv, type Env } from "./env.ts";
import { apiError, json, originAllowed } from "./http.ts";
import { resolveIdentity } from "./identity.ts";

export { WorkspaceObject } from "./workspace-object.ts";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const AUTH_PATH = "/api/auth";

type AuthRuntime = { auth: Auth; settings: AuthSettings };

// One Better Auth instance per isolate and environment: building it is not free, and it holds no request state.
const runtimes = new WeakMap<Env, AuthRuntime>();

/**
 * WORKAROUND for celld 0.6.3: a request that awaits a promise settled by I/O another request started can start no
 * I/O of its own afterwards; its D1 queries and timers never complete (wrangler/workerd has no such limit). Better
 * Auth initialises itself with D1 queries, so a runtime is shared only once it is fully initialised, and a request
 * that finds none builds its own instead of waiting for another request's. Once celld fixes this, the cache can hold
 * the instance from the start.
 */
async function authRuntime(env: Env): Promise<AuthRuntime | { missing: string[] }> {
  const cached = runtimes.get(env);
  if (cached) return cached;
  const settings = authSettingsFromEnv(env);
  if ("missing" in settings) return settings;
  if (env.D1_DEV_MIGRATIONS === "apply") await applyDevMigrations(env.DB);
  const auth = createAuth(settings, env.DB);
  await auth.$context;
  const runtime = { auth, settings };
  runtimes.set(env, runtime);
  return runtime;
}

async function handleApi(request: Request, env: Env, runtime: AuthRuntime): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === AUTH_PATH || url.pathname.startsWith(`${AUTH_PATH}/`))
    return runtime.auth.handler(request);

  const upgrade =
    url.pathname === WS_PATH && request.headers.get("Upgrade")?.toLowerCase() === "websocket";
  if (
    (upgrade || !SAFE_METHODS.has(request.method)) &&
    !originAllowed(request, env.ALLOWED_ORIGINS)
  ) {
    return apiError("forbidden_origin", "Cross-origin requests are not allowed");
  }
  if (url.pathname === WS_PATH && !upgrade)
    return apiError("bad_request", "Expected a WebSocket upgrade");

  const identity = await resolveIdentity(
    request,
    runtime.settings.cookieSecret,
    accountsFor(runtime.auth),
    { mint: !upgrade, secure: new URL(runtime.settings.appUrl).protocol === "https:" },
  );
  if (!identity)
    return apiError("unauthorized", "Load /api/snapshot first to get a workspace cookie");

  const stub = env.WORKSPACE.get(env.WORKSPACE.idFromName(identity.workspaceId));
  const response = await stub.fetch(request);
  if (!identity.setCookie) return response;
  const withCookie = new Response(response.body, response);
  withCookie.headers.append("Set-Cookie", identity.setCookie);
  return withCookie;
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/health") return json({ ok: true, protocol: PROTOCOL_VERSION });
      const runtime = await authRuntime(env);
      if ("missing" in runtime)
        return apiError("internal", `Not configured: ${runtime.missing.join(", ")}`);
      return handleApi(request, env, runtime);
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
