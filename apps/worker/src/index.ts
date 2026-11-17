import { PROTOCOL_VERSION, WS_PATH } from "@vitask/protocol";

import type { Env } from "./env.ts";
import { apiError, json, originAllowed } from "./http.ts";
import { resolveIdentity } from "./identity.ts";

export { WorkspaceObject } from "./workspace-object.ts";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api/health") return json({ ok: true, protocol: PROTOCOL_VERSION });

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
  if (!env.COOKIE_SECRET) return apiError("internal", "COOKIE_SECRET is not configured");

  const identity = await resolveIdentity(request, env.COOKIE_SECRET, { mint: !upgrade });
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
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return handleApi(request, env);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
