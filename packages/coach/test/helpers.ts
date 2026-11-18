import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  getCurrentSystemPrompt,
  type AssistantMessage,
  type FauxResponseFactory,
} from "@earendil-works/pi-ai";
import { MemoryStorage } from "@earendil-works/pi-durable";
import type { ServerEvent } from "@vitask/protocol";

import type { CoachConfig } from "../src/config.ts";
import { InMemoryWorkspaceStore } from "../src/memory-store.ts";
import { CoachRuntime } from "../src/runtime.ts";

export type ChatStep = AssistantMessage | ((systemPrompt: string) => AssistantMessage);

/**
 * A runtime on memory storage and a faux model. One-shot prompts (hype, nudge, wrap-up) get canned answers chosen by
 * their system prompt; coach turns take the next scripted `chat` step, so tests stay deterministic even when timers
 * fire while the coach runs.
 */
export async function createTestCoach(config: Partial<CoachConfig> = {}) {
  const faux = fauxProvider({ provider: "faux", models: [{ id: "coach", reasoning: false }] });
  const models = createModels();
  models.setProvider(faux.provider);
  const chat: ChatStep[] = [];
  const systemPrompts: string[] = [];
  const dispatch: FauxResponseFactory = (context) => {
    const system = getCurrentSystemPrompt(context.messages);
    if (system.includes("micro celebration")) return fauxAssistantMessage("Hype: nailed it.");
    if (system.includes("wellbeing and healthy habits"))
      return fauxAssistantMessage("Nudge: sip some water.");
    if (system.includes("summarizing a user's focus session"))
      return fauxAssistantMessage("Debrief: a calm, solid session.");
    systemPrompts.push(system);
    const step = chat.shift();
    if (step === undefined) return fauxAssistantMessage("(no scripted reply)");
    return typeof step === "function" ? step(system) : step;
  };
  faux.setResponses(Array.from({ length: 500 }, () => dispatch));

  const events: ServerEvent[] = [];
  const store = new InMemoryWorkspaceStore();
  const runtime = await CoachRuntime.open({
    storage: new MemoryStorage(),
    store,
    models,
    publish: (event) => events.push(event),
    config: {
      provider: "faux",
      model: "coach",
      thinkingLevel: "off",
      minTimerIntervalSeconds: 0,
      ...config,
    },
  });
  runtime.resume();
  return { runtime, store, events, chat, systemPrompts, faux };
}

export async function waitFor<T>(
  probe: () => Promise<T | undefined> | T | undefined,
  timeoutMs = 5_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== undefined && value !== false) return value;
    if (Date.now() > deadline) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
