/**
 * Groq's free tier allows a few thousand tokens per minute per model, so a suite would mostly see 429s. This wraps
 * `fetch` for one host: requests to the same model go one at a time, wait when the last response said the token
 * budget is nearly spent, and a 429 is retried after the delay the server asks for. The coach code is unchanged: the
 * provider SDK calls the global `fetch` as it does in production.
 */

export type RequestRecord = {
  readonly model: string;
  readonly tag: string | undefined;
  /** From sending the request (after any rate-limit wait) to the end of the response body. */
  readonly ms: number;
  readonly status: number;
};

export type RateLimitStats = {
  requests: number;
  rateLimited: number;
  waitedMs: number;
  /** One record per answered request; the latency a model has without this wrapper's waits. */
  records: RequestRecord[];
};

type ModelState = { queue: Promise<void>; resumeAt: number };

/** Parses Groq's reset durations such as `577ms`, `7.66s` or `1m26.4s`. */
export function parseResetMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const match = /^(?:(\d+)h)?(?:(\d+)m(?!s))?(?:([\d.]+)s)?(?:([\d.]+)ms)?$/.exec(value.trim());
  if (!match) return undefined;
  const [, h, m, s, ms] = match;
  return (
    Number(h ?? 0) * 3_600_000 + Number(m ?? 0) * 60_000 + Number(s ?? 0) * 1000 + Number(ms ?? 0)
  );
}

function retryAfterMs(headers: Headers, attempt: number): number {
  const seconds = Number.parseFloat(headers.get("retry-after") ?? "");
  const reset = parseResetMs(headers.get("x-ratelimit-reset-tokens"));
  const base = Number.isFinite(seconds) ? seconds * 1000 : (reset ?? 2000 * 2 ** attempt);
  return Math.min(65_000, base + 250 + Math.random() * 500);
}

/** The same response, with a callback when its body has been read to the end. */
function timed(response: Response, sentAt: number, done: (ms: number) => void): Response {
  if (!response.body) {
    done(performance.now() - sentAt);
    return response;
  }
  const reader = response.body.getReader();
  let recorded = false;
  // The SDK may cancel the body after the last SSE event instead of reading it to the end.
  const finish = () => {
    if (recorded) return;
    recorded = true;
    done(performance.now() - sentAt);
  };
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const chunk = await reader.read();
      if (chunk.done) {
        finish();
        controller.close();
      } else controller.enqueue(chunk.value);
    },
    cancel(reason) {
      finish();
      return reader.cancel(reason);
    },
  });
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function installRateLimitedFetch(options: {
  host: string;
  /** Wait for the token window to reset when fewer tokens than this remain. */
  minRemainingTokens?: number;
  maxRetries?: number;
  /**
   * Most time one request may spend waiting here, queue included. The SDK's request timeout already runs while this
   * wrapper waits, so past this the request goes out anyway and a 429 goes back to the caller's own retry.
   */
  maxWaitMs?: number;
  /** Labels a request from its body, so callers can tell, say, judge requests from coach requests. */
  tagOf?: (body: string) => string | undefined;
}): { stats: RateLimitStats; uninstall: () => void } {
  const original = globalThis.fetch;
  const stats: RateLimitStats = { requests: 0, rateLimited: 0, waitedMs: 0, records: [] };
  const models = new Map<string, ModelState>();
  const minRemaining = options.minRemainingTokens ?? 3000;
  const maxRetries = options.maxRetries ?? 6;
  const maxWaitMs = options.maxWaitMs ?? 40_000;

  const wrapped: typeof fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.includes(options.host)) return original(input, init);
    let model = "unknown";
    const tag = typeof init?.body === "string" ? options.tagOf?.(init.body) : undefined;
    if (typeof init?.body === "string") {
      try {
        model = (JSON.parse(init.body) as { model?: string }).model ?? model;
      } catch {
        // not JSON; one queue for all such requests
      }
    }
    const state = models.get(model) ?? { queue: Promise.resolve(), resumeAt: 0 };
    models.set(model, state);

    // Serialize per model: each request waits for the previous one's headers, not for its whole stream.
    const deadline = Date.now() + maxWaitMs;
    let release!: () => void;
    const previous = state.queue;
    state.queue = new Promise<void>((resolve) => (release = resolve));
    await previous;
    try {
      for (let attempt = 0; ; attempt++) {
        const wait = Math.min(state.resumeAt, deadline) - Date.now();
        if (wait > 0) {
          stats.waitedMs += wait;
          await sleep(wait);
        }
        stats.requests++;
        const sentAt = performance.now();
        const response = await original(input, init);
        const remaining = Number(response.headers.get("x-ratelimit-remaining-tokens"));
        const reset = parseResetMs(response.headers.get("x-ratelimit-reset-tokens"));
        if (response.status === 429 && attempt < maxRetries && Date.now() < deadline) {
          stats.rateLimited++;
          await response.body?.cancel();
          state.resumeAt = Date.now() + retryAfterMs(response.headers, attempt);
          continue;
        }
        const limit = Number(response.headers.get("x-ratelimit-limit-tokens"));
        if (Number.isFinite(remaining) && remaining < minRemaining && reset !== undefined) {
          // The bucket refills steadily until `reset`; wait only for the share this request needs.
          const missing = limit > remaining ? (minRemaining - remaining) / (limit - remaining) : 1;
          state.resumeAt = Date.now() + Math.min(reset, reset * missing) + 200;
        }
        return timed(response, sentAt, (ms) =>
          stats.records.push({ model, tag, ms, status: response.status }),
        );
      }
    } finally {
      release();
    }
  };
  globalThis.fetch = wrapped;
  return {
    stats,
    uninstall: () => {
      globalThis.fetch = original;
    },
  };
}
