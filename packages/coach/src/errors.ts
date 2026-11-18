import type { ErrorCode } from "@vitask/protocol";

/** A refusal the UI can show; hosts map `code` to an HTTP status and the protocol's `ApiError`. */
export class CoachError extends Error {
  readonly code: ErrorCode;
  readonly retryAfterMs: number | undefined;

  constructor(code: ErrorCode, message: string, retryAfterMs?: number) {
    super(message);
    this.name = "CoachError";
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}
