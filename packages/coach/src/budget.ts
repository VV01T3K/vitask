import type { BudgetStatus } from "@vitask/protocol";

import type { CoachConfig } from "./config.ts";
import { CoachError } from "./errors.ts";
import type { WorkspaceStore } from "./store.ts";

const DAY_MS = 24 * 60 * 60_000;
const MINUTE_MS = 60_000;

/** Start of the UTC day containing `now`; budgets reset there. */
export function dayStart(now: number): number {
  return now - (now % DAY_MS);
}

export async function budgetStatus(
  store: WorkspaceStore,
  config: CoachConfig,
  now: number,
): Promise<BudgetStatus> {
  return {
    dailyTokenLimit: config.dailyTokenBudget,
    tokensUsedToday: await store.tokensSince(dayStart(now)),
    chatPerMinute: config.chatPerMinute,
  };
}

export async function budgetExhausted(
  store: WorkspaceStore,
  config: CoachConfig,
  now: number,
): Promise<boolean> {
  return (await store.tokensSince(dayStart(now))) >= config.dailyTokenBudget;
}

/** Throws the typed refusal for a chat submission over the daily budget or the rate limit. */
export async function admitChat(
  store: WorkspaceStore,
  config: CoachConfig,
  now: number,
): Promise<void> {
  if (await budgetExhausted(store, config, now)) {
    throw new CoachError(
      "budget_exhausted",
      "The coach has used today's token budget. It resets at midnight UTC.",
      dayStart(now) + DAY_MS - now,
    );
  }
  const recent = await store.recordChat(now, now - MINUTE_MS);
  if (recent > config.chatPerMinute) {
    throw new CoachError(
      "rate_limited",
      `At most ${config.chatPerMinute} messages a minute. Try again shortly.`,
      MINUTE_MS,
    );
  }
}
