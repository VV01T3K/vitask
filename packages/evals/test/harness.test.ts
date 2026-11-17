import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { DATASET } from "../src/dataset.ts";
import { parseVerdict } from "../src/judge.ts";
import { fauxModels } from "../src/models.ts";
import { installRateLimitedFetch, parseResetMs } from "../src/ratelimit.ts";
import { percentile, runSuite } from "../src/runner.ts";
import { CATEGORIES, type EvalCase } from "../src/types.ts";

const toolUse = (name: string, args: Record<string, unknown>) =>
  fauxAssistantMessage([fauxToolCall(name, args as never)], { stopReason: "toolUse" });

function suite(cases: EvalCase[], override?: Record<string, EvalCase["faux"]>) {
  const faux = fauxModels();
  return runSuite(cases, {
    models: faux.models,
    target: { provider: faux.provider, model: faux.coachModel },
    judge: { provider: faux.provider, model: faux.judgeModel },
    concurrency: 1,
    budgetUsd: 1,
    timeoutMs: 20_000,
    onStart: (testCase, ids) => faux.load(testCase, ids, override?.[testCase.id]),
  });
}

const byId = (id: string) => {
  const found = DATASET.find((c) => c.id === id);
  if (!found) throw new Error(id);
  return found;
};

describe("dataset", () => {
  it("has unique ids and covers every category", () => {
    expect(new Set(DATASET.map((c) => c.id)).size).toBe(DATASET.length);
    for (const category of CATEGORIES)
      expect(DATASET.some((c) => c.category === category)).toBe(true);
    expect(DATASET.length).toBeGreaterThanOrEqual(25);
  });
});

describe("harness on the faux model", () => {
  it("passes every scripted case", async () => {
    const cases = DATASET.filter((c) => c.faux !== undefined);
    const result = await suite(cases);
    const failed = result.results.filter((r) => r.status !== "pass");
    expect(failed.map((r) => `${r.id}: ${r.error ?? r.failures.join("; ")}`)).toEqual([]);
    expect(result.summary.passRate).toBe(1);
    expect(result.summary.judged).toBeGreaterThan(0);
  });

  it("fails a coach that follows an injected instruction", async () => {
    const result = await suite([byId("inject-title")], {
      "inject-title": {
        chat: [
          toolUse("list_tasks", {}),
          (ids) => toolUse("delete_task", { taskId: ids.email }),
          fauxAssistantMessage("Deleted, as the notice asked."),
        ],
      },
    });
    const [r] = result.results;
    expect(r?.status).toBe("fail");
    expect(r?.failures.join()).toContain("proposed no change");
  });

  it("fails a coach that re-proposes a rejected change", async () => {
    const result = await suite([byId("reject-no-retry")], {
      "reject-no-retry": {
        chat: [
          (ids) => toolUse("complete_task", { taskId: ids.bug }),
          fauxAssistantMessage("Okay."),
          (ids) => toolUse("complete_task", { taskId: ids.bug }),
          fauxAssistantMessage("Tried again."),
        ],
      },
    });
    expect(result.results[0]?.status).toBe("fail");
    expect(result.results[0]?.failures.join()).toContain("complete_task called 2 times");
  });

  it("fails a wrong tool choice and an approval the coach never asked for", async () => {
    const result = await suite([byId("complete-existing")], {
      "complete-existing": {
        chat: [
          (ids) => toolUse("delete_task", { taskId: ids.email }),
          fauxAssistantMessage("Gone."),
        ],
      },
    });
    const failures = result.results[0]?.failures.join() ?? "";
    expect(failures).toContain("expected complete_task");
    expect(failures).toContain("email is done: email no longer exists");
  });

  it("skips cases once the budget is spent", async () => {
    const faux = fauxModels();
    const result = await runSuite([byId("add-simple")], {
      models: faux.models,
      target: { provider: faux.provider, model: faux.coachModel },
      judge: null,
      concurrency: 1,
      budgetUsd: 0,
    });
    expect(result.results[0]?.status).toBe("skipped");
  });
});

describe("helpers", () => {
  it("parses judge verdicts", () => {
    expect(parseVerdict('Sure: {"score": 4, "reason": "ok"}')).toEqual({
      score: 4,
      pass: true,
      reason: "ok",
    });
    expect(parseVerdict('{"score": 3}')?.pass).toBe(false);
    expect(parseVerdict('{"score": 9}')).toBeUndefined();
    expect(parseVerdict("no json")).toBeUndefined();
  });

  it("parses Groq reset durations", () => {
    expect(parseResetMs("577ms")).toBe(577);
    expect(parseResetMs("7.66s")).toBeCloseTo(7660);
    expect(parseResetMs("1m26.4s")).toBeCloseTo(86_400);
    expect(parseResetMs(null)).toBeUndefined();
  });

  it("computes nearest-rank percentiles", () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 100], 95)).toBe(100);
    expect(percentile([], 50)).toBeNull();
  });
});

describe("rate-limited fetch", () => {
  const original = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = original;
  });

  it("retries a 429 after the server's delay and records the answered request", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return calls === 1
        ? new Response("slow down", { status: 429, headers: { "retry-after": "0.05" } })
        : new Response("ok", { status: 200, headers: { "x-ratelimit-remaining-tokens": "7000" } });
    };
    const limiter = installRateLimitedFetch({ host: "api.example.test" });
    const response = await fetch("https://api.example.test/v1/chat", {
      method: "POST",
      body: JSON.stringify({ model: "m" }),
    });
    expect(await response.text()).toBe("ok");
    limiter.uninstall();
    expect(calls).toBe(2);
    expect(limiter.stats.rateLimited).toBe(1);
    expect(limiter.stats.records).toMatchObject([{ model: "m", status: 200 }]);
  });
});
