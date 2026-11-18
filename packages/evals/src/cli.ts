import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { DATASET } from "./dataset.ts";
import { JUDGE_MARKER } from "./judge.ts";
import { fauxModels, groqModels } from "./models.ts";
import { installRateLimitedFetch } from "./ratelimit.ts";
import { comparisonTable, printSuite, writeReports } from "./report.ts";
import { percentile, runSuite, type SuiteResult, type Target } from "./runner.ts";
import type { EvalCase } from "./types.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PRODUCTION_MODEL = "openai/gpt-oss-120b";
const MATRIX = [PRODUCTION_MODEL, "openai/gpt-oss-20b", "qwen/qwen3.8-27b"];

const { values } = parseArgs({
  options: {
    faux: { type: "boolean", default: false },
    matrix: { type: "boolean", default: false },
    model: { type: "string", multiple: true },
    judge: { type: "string" },
    cases: { type: "string" },
    category: { type: "string" },
    limit: { type: "string" },
    concurrency: { type: "string", default: "2" },
    budget: { type: "string", default: "0.5" },
    "min-pass-rate": { type: "string" },
    out: { type: "string", default: join(HERE, "..", "reports") },
    name: { type: "string" },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(`vitask coach evals

  --faux               scripted faux model, no key needed (cases with a faux script only)
  --matrix             run ${MATRIX.join(", ")} and compare
  --model <id>         Groq model under test (repeatable; default ${PRODUCTION_MODEL})
  --judge <id|none>    judge model (default qwen/qwen3.8-27b, or ${PRODUCTION_MODEL} when testing qwen)
  --cases a,b          only these case ids      --category <name>  only this category
  --limit <n>          first n cases            --concurrency <n>  cases in flight per model (default 2)
  --budget <usd>       stop starting cases past this spend per model (default 0.5)
  --min-pass-rate <r>  exit 1 if any model passes fewer than r (0..1) of the cases
  --out <dir>          report directory         --name <base>      report file name without extension`);
  process.exit(0);
}

function selectCases(): EvalCase[] {
  let cases = [...DATASET];
  if (values.faux) cases = cases.filter((c) => c.faux !== undefined);
  if (values.cases) {
    const ids = new Set(values.cases.split(","));
    cases = cases.filter((c) => ids.has(c.id));
  }
  if (values.category) cases = cases.filter((c) => c.category === values.category);
  if (values.limit) cases = cases.slice(0, Number(values.limit));
  if (cases.length === 0) throw new Error("no cases selected");
  return cases;
}

/** The key comes from the environment, or from the Worker's local `.dev.vars`; it is never printed. */
function loadGroqKey(): boolean {
  if (process.env.GROQ_API_KEY) return true;
  const file = resolve(HERE, "../../../apps/worker/.dev.vars");
  if (!existsSync(file)) return false;
  const match = /^GROQ_API_KEY\s*=\s*"?([^"\n]+)"?\s*$/m.exec(readFileSync(file, "utf8"));
  if (match?.[1]) process.env.GROQ_API_KEY = match[1].trim();
  return Boolean(process.env.GROQ_API_KEY);
}

const progress =
  (target: string) =>
  (r: { id: string; status: string; failures: readonly string[]; error: string | null }) =>
    console.log(
      `[${target}] ${r.status.toUpperCase().padEnd(7)} ${r.id}${
        r.status === "pass" ? "" : `  ${(r.error ?? r.failures.join("; ")).slice(0, 200)}`
      }`,
    );

async function main(): Promise<number> {
  const cases = selectCases();
  const concurrency = Number(values.concurrency);
  const budgetUsd = Number(values.budget);
  const suites: SuiteResult[] = [];

  if (values.faux) {
    const faux = fauxModels();
    const target = { provider: faux.provider, model: faux.coachModel };
    suites.push(
      await runSuite(cases, {
        models: faux.models,
        target,
        judge: { provider: faux.provider, model: faux.judgeModel },
        // One shared script, so one case at a time.
        concurrency: 1,
        budgetUsd,
        timeoutMs: 30_000,
        onStart: (testCase, ids) => faux.load(testCase, ids),
        onResult: progress("faux"),
      }),
    );
  } else {
    if (!loadGroqKey()) {
      console.error("GROQ_API_KEY is not set (and apps/worker/.dev.vars has none).");
      return 2;
    }
    const limiter = installRateLimitedFetch({
      host: "api.groq.com",
      tagOf: (body) => (body.includes(JUDGE_MARKER) ? "judge" : undefined),
    });
    const models = groqModels();
    const ids = values.matrix ? MATRIX : (values.model ?? [PRODUCTION_MODEL]);
    const judgeFor = (model: string): Target | null => {
      if (values.judge === "none") return null;
      if (values.judge) return { provider: "groq", model: values.judge };
      return {
        provider: "groq",
        model: model.startsWith("qwen/") ? PRODUCTION_MODEL : "qwen/qwen3.8-27b",
      };
    };
    for (const id of ids) {
      if (!models.getModel("groq", id)) throw new Error(`groq/${id} is not in pi-ai's catalog`);
    }
    // One model at a time: a free-tier key has a small token budget per model, and in the matrix every model is
    // another one's judge, so running them side by side starves the shared buckets.
    const runs: SuiteResult[] = [];
    for (const model of ids) {
      runs.push(
        await runSuite(cases, {
          models,
          target: { provider: "groq", model },
          judge: judgeFor(model),
          concurrency,
          budgetUsd,
          timeoutMs: 600_000,
          onResult: progress(model),
        }),
      );
    }
    limiter.uninstall();
    // The coach's turn log times include this wrapper's rate-limit waits; the wrapper's own records do not.
    for (const suite of runs) {
      const latencies = limiter.stats.records
        .filter((r) => r.model === suite.target.model && r.tag === undefined && r.status === 200)
        .map((r) => r.ms);
      suites.push({
        ...suite,
        summary: {
          ...suite.summary,
          latencySource: "fetch",
          requestLatencyP50Ms: percentile(latencies, 50),
          requestLatencyP95Ms: percentile(latencies, 95),
        },
      });
    }
    console.log(
      `\nGroq requests: ${limiter.stats.requests}, rate-limited: ${limiter.stats.rateLimited}, waited ${(limiter.stats.waitedMs / 1000).toFixed(0)} s`,
    );
  }

  for (const suite of suites) printSuite(suite);
  if (suites.length > 1) console.log(`\n${comparisonTable(suites)}`);
  const written = await writeReports(values.out, suites, values.name);
  console.log(`\nReports: ${written.join(", ")}`);

  if (values["min-pass-rate"] !== undefined) {
    const threshold = Number(values["min-pass-rate"]);
    const below = suites.filter((s) => s.summary.passRate < threshold);
    if (below.length > 0) {
      console.error(
        `Pass rate below ${threshold}: ${below.map((s) => `${s.target.model} ${s.summary.passRate.toFixed(3)}`).join(", ")}`,
      );
      return 1;
    }
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(2);
  },
);
