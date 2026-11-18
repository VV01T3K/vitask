import { ApiError } from "@vitask/protocol";
import type { z } from "zod";

import type { UiError } from "./types.ts";

export class RequestFailed extends Error {
  constructor(readonly error: UiError) {
    super(error.message);
  }
}

export function toUiError(error: unknown): UiError {
  if (error instanceof RequestFailed) return error.error;
  if (error && typeof error === "object" && "code" in error && "message" in error)
    return error as UiError;
  return { code: "network", message: "Could not reach the server." };
}

export type HttpResult<T> = { data: T; serverDate: number | null };

/** JSON over HTTP to the Worker; answers are validated, errors become `RequestFailed` with a `UiError`. */
export async function http<S extends z.ZodType>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  schema: S,
  body?: unknown,
): Promise<HttpResult<z.infer<S>>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new RequestFailed({ code: "network", message: "Could not reach the server." });
  }
  const dateHeader = response.headers.get("Date");
  const serverDate = dateHeader ? Date.parse(dateHeader) : null;
  const text = await response.text();
  let json: unknown = undefined;
  try {
    json = text === "" ? undefined : JSON.parse(text);
  } catch {
    json = undefined;
  }
  if (!response.ok) {
    const parsed = ApiError.safeParse(json);
    throw new RequestFailed(
      parsed.success
        ? parsed.data.error
        : { code: "internal", message: `The server answered ${response.status}.` },
    );
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success)
    throw new RequestFailed({
      code: "invalid_response",
      message: "The server sent something this page does not understand. Reload to update.",
    });
  return { data: parsed.data, serverDate: Number.isNaN(serverDate) ? null : serverDate };
}
