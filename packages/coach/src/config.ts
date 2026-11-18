import type { ModelThinkingLevel } from "@earendil-works/pi-ai";

export type CoachConfig = {
  /** pi-ai provider id, for example `groq`. */
  readonly provider: string;
  readonly model: string;
  readonly thinkingLevel: ModelThinkingLevel;
  /** Input plus output tokens per workspace per UTC day; chat is refused and one-shots fall back past it. */
  readonly dailyTokenBudget: number;
  /** Chat submissions per workspace per rolling minute. */
  readonly chatPerMinute: number;
  /** Tool rounds one coach run may take. */
  readonly maxTurns: number;
  /** How long a proposed change waits for the user before it expires. */
  readonly approvalTtlMs: number;
  /** A session ends by itself after this long, so care timers never run unattended forever. */
  readonly maxSessionMs: number;
  /** Shortest care-timer interval the workspace accepts. */
  readonly minTimerIntervalSeconds: number;
  /** Upper bound for one-shot generations (hype, nudge, wrap-up). */
  readonly oneShotTimeoutMs: number;
};

export const DEFAULT_CONFIG: CoachConfig = {
  provider: "groq",
  model: "openai/gpt-oss-120b",
  thinkingLevel: "low",
  dailyTokenBudget: 200_000,
  chatPerMinute: 10,
  maxTurns: 8,
  approvalTtlMs: 10 * 60_000,
  maxSessionMs: 4 * 60 * 60_000,
  minTimerIntervalSeconds: 60,
  oneShotTimeoutMs: 20_000,
};
