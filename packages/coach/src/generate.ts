import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { TextSource, Trigger, TurnLogEntry, TurnOutcome } from "@vitask/protocol";

import { budgetExhausted, budgetStatus } from "./budget.ts";
import type { CoachDeps } from "./deps.ts";

const MAX_ERROR_LENGTH = 500;

function outcomeOf(message: AssistantMessage): TurnOutcome {
  switch (message.stopReason) {
    case "error":
      return "error";
    case "aborted":
      return "aborted";
    case "length":
      return "length";
    default:
      return "ok";
  }
}

/** One turn-log row from a terminal provider message; the numbers come from pi-ai's usage accounting. */
export function turnFromMessage(
  deps: Pick<CoachDeps, "newId" | "now">,
  message: AssistantMessage,
  meta: { trigger: Trigger; conversationId: string | null; runId: string | null },
): TurnLogEntry {
  const usage = message.usage;
  return {
    id: deps.newId("turn"),
    at: message.timestamp || deps.now(),
    trigger: meta.trigger,
    conversationId: meta.conversationId,
    runId: meta.runId,
    provider: message.provider,
    model: message.model,
    inputTokens: usage.input + usage.cacheRead,
    outputTokens: usage.output,
    cacheReadTokens: usage.cacheRead,
    costUsd: Number.isFinite(usage.cost.total) ? usage.cost.total : null,
    latencyMs: message.durationMs === undefined ? null : Math.round(message.durationMs),
    toolCalls: message.content.flatMap((block) => (block.type === "toolCall" ? [block.name] : [])),
    outcome: outcomeOf(message),
    error: message.errorMessage?.slice(0, MAX_ERROR_LENGTH) ?? null,
  };
}

export async function logTurn(deps: CoachDeps, turn: TurnLogEntry): Promise<void> {
  await deps.store.insertTurn(turn);
  deps.publish({ type: "turn.logged", turn });
  deps.publish({
    type: "budget.updated",
    budget: await budgetStatus(deps.store, deps.config, deps.now()),
  });
}

export function textOf(message: AssistantMessage): string {
  return message.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim();
}

/** Models sometimes wrap a one-liner in quotes despite being told not to. */
function unquote(text: string): string {
  const match = /^["“'](.*)["”']$/s.exec(text);
  return match?.[1]?.trim() ?? text;
}

/** v1's house style bans em dashes and spaced hyphens; models still emit them, so they become commas. */
function undash(text: string): string {
  return text.replace(/\s*[—–]\s*/g, ", ").replace(/\s+-\s+/g, ", ");
}

export type OneShot = {
  readonly trigger: Exclude<Trigger, "chat">;
  readonly system: string;
  readonly prompt: string;
  readonly fallback: string;
  readonly maxTokens: number;
  /** The durable task the text is for, logged as the run id. */
  readonly runId: string | null;
};

/**
 * A single model request outside the coach conversation (hype, nudge, wrap-up). Never throws: over budget, on a
 * provider error or an empty answer it returns `fallback`, and every request it makes is logged.
 */
export async function generateOneShot(
  deps: CoachDeps,
  request: OneShot,
): Promise<{ text: string; source: TextSource }> {
  const { config, models } = deps;
  const fallback = { text: request.fallback, source: "fallback" as const };
  if (await budgetExhausted(deps.store, config, deps.now())) {
    await logTurn(deps, {
      id: deps.newId("turn"),
      at: deps.now(),
      trigger: request.trigger,
      conversationId: null,
      runId: request.runId,
      provider: config.provider,
      model: config.model,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      costUsd: 0,
      latencyMs: null,
      toolCalls: [],
      outcome: "budget_exhausted",
      error: null,
    });
    return fallback;
  }
  const model = models.getModel(config.provider, config.model);
  if (!model) return fallback;
  let message: AssistantMessage;
  try {
    message = await models.completeSimple(
      model,
      {
        systemPrompt: request.system,
        messages: [{ role: "user", content: request.prompt, timestamp: deps.now() }],
      },
      {
        maxTokens: request.maxTokens,
        reasoning: model.reasoning ? "low" : undefined,
        signal: AbortSignal.timeout(config.oneShotTimeoutMs),
      },
    );
  } catch (error) {
    // completeSimple reports provider failures in the message; a throw is a bug or a missing credential.
    await logTurn(deps, {
      id: deps.newId("turn"),
      at: deps.now(),
      trigger: request.trigger,
      conversationId: null,
      runId: request.runId,
      provider: config.provider,
      model: config.model,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      costUsd: null,
      latencyMs: null,
      toolCalls: [],
      outcome: "error",
      error: String(error).slice(0, MAX_ERROR_LENGTH),
    });
    return fallback;
  }
  await logTurn(
    deps,
    turnFromMessage(deps, message, {
      trigger: request.trigger,
      conversationId: null,
      runId: request.runId,
    }),
  );
  const text = undash(unquote(textOf(message)));
  if (message.stopReason === "error" || message.stopReason === "aborted" || text === "")
    return fallback;
  return { text, source: "ai" };
}
