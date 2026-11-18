import type { Models } from "@earendil-works/pi-ai";

import { runCase } from "./harness.ts";
import { judge } from "./judge.ts";
import type { CaseResult, Category, EvalCase } from "./types.ts";

export type Target = { readonly provider: string; readonly model: string };

export type SuiteOptions = {
  readonly models: Models;
  readonly target: Target;
  /** The judge for cases with a rubric; null skips judging (those cases then rely on their checks only). */
  readonly judge: Target | null;
  readonly concurrency: number;
  /** Stop starting cases once the suite has spent this much. */
  readonly budgetUsd: number;
  readonly timeoutMs?: number;
  readonly onStart?: (testCase: EvalCase, ids: Record<string, string>) => void;
  readonly onResult?: (result: CaseResult) => void;
};

export type Summary = {
  readonly cases: number;
  readonly passed: number;
  readonly failed: number;
  readonly errors: number;
  readonly skipped: number;
  /** Passed over the cases that ran (skipped ones excluded). */
  readonly passRate: number;
  /** Passed over passed plus failed: the coach's score on the cases that were graded, infra errors left out. */
  readonly gradedPassRate: number;
  readonly meanJudgeScore: number | null;
  readonly judged: number;
  readonly totalTokens: number;
  readonly coachTokens: number;
  readonly judgeTokens: number;
  readonly totalCostUsd: number;
  /** Where request latencies come from: the coach's turn log, or the eval's fetch wrapper (rate-limit waits excluded). */
  readonly latencySource: "turn-log" | "fetch";
  readonly requestLatencyP50Ms: number | null;
  readonly requestLatencyP95Ms: number | null;
  readonly caseDurationP50Ms: number | null;
  readonly caseDurationP95Ms: number | null;
  readonly byCategory: Record<string, { passed: number; total: number }>;
};

export type SuiteResult = {
  readonly target: Target;
  readonly judge: Target | null;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly results: readonly CaseResult[];
  readonly summary: Summary;
};

export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? null;
}

export function summarize(results: readonly CaseResult[]): Summary {
  const ran = results.filter((r) => r.status !== "skipped");
  const judged = ran.flatMap((r) => (r.judge ? [r.judge.score] : []));
  const coachTokens = results.reduce((s, r) => s + r.inputTokens + r.outputTokens, 0);
  const judgeTokens = results.reduce((s, r) => s + r.judgeTokens, 0);
  const byCategory: Record<string, { passed: number; total: number }> = {};
  for (const r of ran) {
    const entry = (byCategory[r.category] ??= { passed: 0, total: 0 });
    entry.total++;
    if (r.status === "pass") entry.passed++;
  }
  const passed = ran.filter((r) => r.status === "pass").length;
  return {
    cases: results.length,
    passed,
    failed: ran.filter((r) => r.status === "fail").length,
    errors: ran.filter((r) => r.status === "error").length,
    skipped: results.length - ran.length,
    passRate: ran.length === 0 ? 0 : passed / ran.length,
    gradedPassRate: passed / Math.max(1, passed + ran.filter((r) => r.status === "fail").length),
    meanJudgeScore: judged.length === 0 ? null : judged.reduce((a, b) => a + b, 0) / judged.length,
    judged: judged.length,
    totalTokens: coachTokens + judgeTokens,
    coachTokens,
    judgeTokens,
    totalCostUsd: results.reduce((s, r) => s + r.costUsd + r.judgeCostUsd, 0),
    latencySource: "turn-log",
    requestLatencyP50Ms: percentile(
      ran.flatMap((r) => r.requestLatenciesMs),
      50,
    ),
    requestLatencyP95Ms: percentile(
      ran.flatMap((r) => r.requestLatenciesMs),
      95,
    ),
    caseDurationP50Ms: percentile(
      ran.map((r) => r.durationMs),
      50,
    ),
    caseDurationP95Ms: percentile(
      ran.map((r) => r.durationMs),
      95,
    ),
    byCategory: byCategory as Record<Category, { passed: number; total: number }>,
  };
}

const INFRA = /\b429\b|rate limit|timed out|aborted/i;

/** Provider error bodies name the account (`org_...`); reports are committed, so they never keep it. */
const ACCOUNT_ID = /\borg_[A-Za-z0-9]+/g;
const scrub = (text: string) => text.replace(ACCOUNT_ID, "org_[redacted]");

async function evaluate(testCase: EvalCase, options: SuiteOptions): Promise<CaseResult> {
  const result = await grade(testCase, options);
  return {
    ...result,
    error: result.error === null ? null : scrub(result.error),
    failures: result.failures.map(scrub),
    transcript: result.transcript.map(scrub),
  };
}

async function grade(testCase: EvalCase, options: SuiteOptions): Promise<CaseResult> {
  const outcome = await runCase(testCase, {
    models: options.models,
    provider: options.target.provider,
    model: options.target.model,
    timeoutMs: options.timeoutMs,
    onStart: options.onStart,
  });
  const turns = outcome.run?.turns ?? [];
  const base = {
    id: testCase.id,
    category: testCase.category,
    toolCalls: outcome.run?.toolCalls.map((c) => c.name) ?? [],
    text: outcome.run?.text ?? "",
    transcript: (outcome.run?.entries ?? []).map((e) =>
      [
        `${e.role}:`,
        e.toolName ?? "",
        e.text,
        ...e.toolCalls.map((c) => `-> ${c.name}(${JSON.stringify(c.args)})`),
      ]
        .filter(Boolean)
        .join(" ")
        .slice(0, 600),
    ),
    inputTokens: turns.reduce((s, t) => s + t.inputTokens, 0),
    outputTokens: turns.reduce((s, t) => s + t.outputTokens, 0),
    costUsd: turns.reduce((s, t) => s + (t.costUsd ?? 0), 0),
    durationMs: outcome.durationMs,
    requestLatenciesMs: turns.flatMap((t) => (t.latencyMs === null ? [] : [t.latencyMs])),
  };
  if (outcome.error !== null || outcome.run === null) {
    return {
      ...base,
      status: "error",
      failures: [],
      judge: null,
      judgeTokens: 0,
      judgeCostUsd: 0,
      error: outcome.error,
    };
  }
  const failures = [...outcome.failures];
  let verdict: CaseResult["judge"] = null;
  let judgeTokens = 0;
  let judgeCostUsd = 0;
  let error: string | null = null;
  // Judge only what passed its deterministic checks; a failed case is failed whatever its prose is like.
  if (testCase.judge !== undefined && options.judge !== null && failures.length === 0) {
    try {
      const judged = await judge(options.models, options.judge, testCase, outcome.run);
      verdict = judged.verdict;
      judgeTokens = judged.tokens;
      judgeCostUsd = judged.costUsd;
      if (verdict.reason.startsWith("judge gave no verdict")) error = verdict.reason;
      else if (!verdict.pass) failures.push(`judge ${verdict.score}/5: ${verdict.reason}`);
    } catch (cause) {
      error = `judge failed: ${cause instanceof Error ? cause.message : String(cause)}`;
    }
  }
  // A request the provider refused for quota or that ran out of time says nothing about the coach.
  if (error === null && failures.some((f) => f.startsWith("model request failed") && INFRA.test(f)))
    error = failures.find((f) => f.startsWith("model request failed")) ?? null;
  const status = error !== null ? "error" : failures.length === 0 ? "pass" : "fail";
  return { ...base, status, failures, judge: verdict, judgeTokens, judgeCostUsd, error };
}

/** Runs cases with limited concurrency; once the budget is spent the rest are skipped. */
export async function runSuite(
  cases: readonly EvalCase[],
  options: SuiteOptions,
): Promise<SuiteResult> {
  const startedAt = new Date().toISOString();
  const results: CaseResult[] = [];
  let spent = 0;
  let next = 0;
  const worker = async () => {
    for (;;) {
      const index = next++;
      const testCase = cases[index];
      if (testCase === undefined) return;
      let result: CaseResult;
      if (spent >= options.budgetUsd) {
        result = {
          id: testCase.id,
          category: testCase.category,
          status: "skipped",
          failures: [`budget of $${options.budgetUsd} spent`],
          judge: null,
          toolCalls: [],
          text: "",
          transcript: [],
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          durationMs: 0,
          requestLatenciesMs: [],
          judgeTokens: 0,
          judgeCostUsd: 0,
          error: null,
        };
      } else {
        result = await evaluate(testCase, options);
        spent += result.costUsd + result.judgeCostUsd;
      }
      results[index] = result;
      options.onResult?.(result);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, options.concurrency) }, worker));
  return {
    target: options.target,
    judge: options.judge,
    startedAt,
    finishedAt: new Date().toISOString(),
    results,
    summary: summarize(results),
  };
}
