import type { UiError } from "../state/types.ts";

/** "in 12 s", "in 4 min", "in 3 h" */
export function inDuration(ms: number): string {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  if (seconds < 90) return `in ${seconds} s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 90) return `in ${minutes} min`;
  return `in ${Math.round(minutes / 60)} h`;
}

/** A sentence for the user, never raw JSON. */
export function describeError(error: UiError): string {
  const retry = error.retryAfterMs !== undefined ? inDuration(error.retryAfterMs) : null;
  switch (error.code) {
    case "budget_exhausted":
      return `Today's AI budget is used up${retry ? `; the coach is back ${retry}` : ""}. Your tasks and timers still work.`;
    case "rate_limited":
      return `That's a lot of messages at once. Try again ${retry ?? "in a moment"}.`;
    case "bad_request":
      if (error.issues && error.issues.length > 0) {
        const issue = error.issues[0]!;
        return issue.path ? `${issue.path}: ${issue.message}` : issue.message;
      }
      return error.message;
    case "no_active_session":
      return "Start a session first.";
    case "network":
      return error.message;
    case "internal":
      return "Something went wrong on the server. Try again.";
    default:
      return error.message;
  }
}
