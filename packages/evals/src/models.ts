import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  getCurrentSystemPrompt,
  type FauxResponseFactory,
  type Models,
} from "@earendil-works/pi-ai";
import { groqProvider } from "@earendil-works/pi-ai/providers/groq";

import { JUDGE_MARKER } from "./judge.ts";
import type { EvalCase, FauxStep } from "./types.ts";

/**
 * Groq with one catalog fix: pi-ai 1.5.2 sends the system prompt of reasoning models as a `developer` message, which
 * Groq's Qwen templates reject ("Unexpected message role"). Qwen models get `supportsDeveloperRole: false`; the
 * production model (gpt-oss) is untouched.
 */
export function groqModels(): Models {
  const base = groqProvider();
  const fix = <M extends { id: string; compat?: object }>(model: M): M =>
    model.id.startsWith("qwen/")
      ? { ...model, compat: { ...model.compat, supportsDeveloperRole: false } }
      : model;
  const provider = new Proxy(base, {
    get(target, key, receiver) {
      if (key === "getModels") return () => target.getModels().map(fix);
      if (key === "getAllModels" && target.getAllModels)
        return () => target.getAllModels?.().map(fix);
      const value: unknown = Reflect.get(target, key, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const models = createModels();
  models.setProvider(provider);
  return models;
}

// One-shot system prompts from packages/coach/src/prompts.ts; the faux model answers them from the case.
const ONE_SHOT_MARKERS = [
  "micro celebration",
  "wellbeing and healthy habits",
  "summarizing a user's focus session",
];

/**
 * pi-ai's faux provider with one scripted case at a time: coach turns take the case's next chat step, one-shot
 * prompts get the case's text, and the judge always answers with a passing verdict. Cases run one after another in
 * faux mode, so one shared script is enough.
 */
export function fauxModels() {
  const faux = fauxProvider({
    provider: "faux",
    models: [
      { id: "coach", reasoning: false },
      { id: "judge", reasoning: false },
    ],
  });
  const models = createModels();
  models.setProvider(faux.provider);
  let steps: FauxStep[] = [];
  let ids: Readonly<Record<string, string>> = {};
  let oneShot = "";

  const dispatch: FauxResponseFactory = (context, _options, _state, model) => {
    const system = getCurrentSystemPrompt(context.messages);
    if (model.id === "judge" || system.startsWith(JUDGE_MARKER))
      return fauxAssistantMessage('{"score": 5, "reason": "Scripted faux verdict."}');
    if (ONE_SHOT_MARKERS.some((marker) => system.includes(marker)))
      return fauxAssistantMessage(oneShot || "(no scripted text)");
    const step = steps.shift();
    if (step === undefined) return fauxAssistantMessage("(no scripted reply)");
    return typeof step === "function" ? step(ids) : step;
  };
  faux.setResponses(Array.from({ length: 10_000 }, () => dispatch));

  return {
    models,
    provider: "faux",
    coachModel: "coach",
    judgeModel: "judge",
    /** Queues a case's script; `override` replaces it, for tests that feed a deliberately bad script. */
    load(testCase: EvalCase, caseIds: Record<string, string>, override?: EvalCase["faux"]) {
      const script = override ?? testCase.faux;
      steps = [...(script?.chat ?? [])];
      oneShot = script?.text ?? "";
      ids = caseIds;
    },
  };
}
