import type { CoachRuntime } from "@vitask/coach";
import {
  ChatBody,
  CreateTaskBody,
  CreateTimerBody,
  DecideApprovalBody,
  TurnLogQuery,
  UpdateTaskBody,
  UpdateTimerBody,
} from "@vitask/protocol";
import type { z } from "zod";

import { apiError, errorResponse, json } from "./http.ts";

type Handler = (runtime: CoachRuntime, request: Request, params: string[]) => Promise<Response>;
type Route = { method: string; pattern: RegExp; handler: Handler };

const MAX_BODY_BYTES = 64 * 1024;

async function body<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return schema.parse(undefined);
  let value: unknown;
  try {
    value = text === "" ? {} : JSON.parse(text);
  } catch {
    value = undefined;
  }
  return schema.parse(value);
}

const id = "([A-Za-z0-9_-]{1,64})";
const route = (method: string, path: string, handler: Handler): Route => ({
  method,
  pattern: new RegExp(`^${path.replaceAll(":id", id)}$`),
  handler,
});

const ROUTES: Route[] = [
  route("GET", "/api/snapshot", async (runtime) => json(await runtime.snapshot())),

  route("POST", "/api/tasks", async (runtime, request) =>
    json(await runtime.createTask(await body(request, CreateTaskBody)), 201),
  ),
  route("PATCH", "/api/tasks/:id", async (runtime, request, [taskId]) =>
    json(await runtime.updateTask(taskId!, await body(request, UpdateTaskBody))),
  ),
  route("POST", "/api/tasks/:id/complete", async (runtime, _request, [taskId]) =>
    json(await runtime.completeTask(taskId!)),
  ),
  route("DELETE", "/api/tasks/:id", async (runtime, _request, [taskId]) => {
    await runtime.deleteTask(taskId!);
    return new Response(null, { status: 204 });
  }),

  route("POST", "/api/timers", async (runtime, request) =>
    json(await runtime.createTimer(await body(request, CreateTimerBody)), 201),
  ),
  route("PATCH", "/api/timers/:id", async (runtime, request, [timerId]) =>
    json(await runtime.updateTimer(timerId!, await body(request, UpdateTimerBody))),
  ),
  route("DELETE", "/api/timers/:id", async (runtime, _request, [timerId]) => {
    await runtime.deleteTimer(timerId!);
    return new Response(null, { status: 204 });
  }),

  route("POST", "/api/session/start", async (runtime) => json(await runtime.startSession())),
  route("POST", "/api/session/end", async (runtime) => json(await runtime.endSession())),

  route("POST", "/api/chat", async (runtime, request) => {
    const { text, requestId } = await body(request, ChatBody);
    const { submissionId } = await runtime.chat(text, requestId);
    return json({ submissionId, requestId }, 202);
  }),
  route("POST", "/api/approvals/:id", async (runtime, request, [approvalId]) => {
    const { decision } = await body(request, DecideApprovalBody);
    return json(await runtime.decideApproval(approvalId!, decision));
  }),

  route("GET", "/api/turns", async (runtime, request) => {
    const { limit } = TurnLogQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
    return json({ turns: await runtime.turns(limit) });
  }),
];

export async function routeApi(runtime: CoachRuntime, request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  let pathMatched = false;
  for (const candidate of ROUTES) {
    const match = candidate.pattern.exec(pathname);
    if (!match) continue;
    pathMatched = true;
    if (candidate.method !== request.method) continue;
    try {
      return await candidate.handler(runtime, request, match.slice(1));
    } catch (error) {
      return errorResponse(error);
    }
  }
  return pathMatched
    ? apiError("bad_request", "Method not allowed")
    : apiError("not_found", "No such endpoint");
}
