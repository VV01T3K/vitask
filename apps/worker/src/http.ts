import { CoachError } from "@vitask/coach";
import type { ApiError, ErrorCode } from "@vitask/protocol";
import { ZodError } from "zod";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden_origin: 403,
  not_found: 404,
  conflict: 409,
  no_active_session: 409,
  limit_reached: 409,
  rate_limited: 429,
  budget_exhausted: 429,
  internal: 500,
};

export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(body, { status, headers });
}

export function errorBody(error: unknown): { status: number; body: ApiError } {
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: {
          code: "bad_request",
          message: "Invalid request",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
    };
  }
  if (error instanceof CoachError) {
    const retry =
      error.retryAfterMs === undefined ? {} : { retryAfterMs: Math.ceil(error.retryAfterMs) };
    return {
      status: STATUS[error.code],
      body: { error: { code: error.code, message: error.message, ...retry } },
    };
  }
  console.error("unhandled error", error);
  return { status: 500, body: { error: { code: "internal", message: "Something went wrong." } } };
}

export function errorResponse(error: unknown): Response {
  const { status, body } = errorBody(error);
  const retry = body.error.retryAfterMs;
  return json(
    body,
    status,
    retry === undefined ? {} : { "Retry-After": String(Math.ceil(retry / 1000)) },
  );
}

export function apiError(code: ErrorCode, message: string): Response {
  return json({ error: { code, message } } satisfies ApiError, STATUS[code]);
}

/**
 * Same-origin policy for state-changing requests and WebSocket upgrades: a browser always sends `Origin` there, so
 * a foreign one is refused. Requests without `Origin` come from non-browser clients, which cookies-based CSRF cannot
 * reach.
 */
export function originAllowed(request: Request, extraOrigins: string | undefined): boolean {
  const origin = request.headers.get("Origin");
  if (origin === null) return request.headers.get("Sec-Fetch-Site") !== "cross-site";
  if (origin === new URL(request.url).origin) return true;
  return (extraOrigins ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(origin);
}
