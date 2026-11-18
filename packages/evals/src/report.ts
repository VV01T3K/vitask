import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { SuiteResult, Summary } from "./runner.ts";

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const usd = (value: number) => `$${value.toFixed(4)}`;
const ms = (value: number | null) => (value === null ? "n/a" : `${(value / 1000).toFixed(2)} s`);
const cell = (text: string) => text.replaceAll("|", "\\|").replaceAll("\n", " ");

export const label = (suite: SuiteResult) => `${suite.target.provider}/${suite.target.model}`;

export function caseTable(suite: SuiteResult): string {
  const rows = suite.results.map((r) =>
    [
      r.id,
      r.category,
      r.status.toUpperCase(),
      r.judge ? `${r.judge.score}/5` : "",
      r.toolCalls.join(", "),
      String(r.inputTokens + r.outputTokens + r.judgeTokens),
      usd(r.costUsd + r.judgeCostUsd),
      ms(r.durationMs),
      cell(r.error ?? r.failures.join("; ")).slice(0, 300),
    ].map(cell),
  );
  return [
    "| case | category | result | judge | tools | tokens | cost | time | notes |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

export function summaryLines(summary: Summary): string[] {
  return [
    `Pass rate: ${pct(summary.passRate)} (${summary.passed}/${summary.cases - summary.skipped}; ${summary.failed} failed, ${summary.errors} errors, ${summary.skipped} skipped)`,
    `Graded pass rate (infra errors such as provider quota left out): ${pct(summary.gradedPassRate)}`,
    `Mean judge score: ${summary.meanJudgeScore === null ? "n/a" : summary.meanJudgeScore.toFixed(2)} over ${summary.judged} judged cases`,
    `Tokens: ${summary.totalTokens} (coach ${summary.coachTokens}, judge ${summary.judgeTokens})`,
    `Cost: ${usd(summary.totalCostUsd)}`,
    `Model request latency (${summary.latencySource === "fetch" ? "measured at fetch, rate-limit waits excluded" : "from the turn log"}): p50 ${ms(summary.requestLatencyP50Ms)}, p95 ${ms(summary.requestLatencyP95Ms)}`,
    `Case wall time (approvals and rate-limit waits included): p50 ${ms(summary.caseDurationP50Ms)}, p95 ${ms(summary.caseDurationP95Ms)}`,
    `By category: ${Object.entries(summary.byCategory)
      .map(([category, c]) => `${category} ${c.passed}/${c.total}`)
      .join(", ")}`,
  ];
}

export function markdownReport(suite: SuiteResult, title = "Coach eval"): string {
  return [
    `# ${title}: ${label(suite)}`,
    "",
    `Judge: ${suite.judge ? `${suite.judge.provider}/${suite.judge.model}` : "none"}. Run ${suite.startedAt} to ${suite.finishedAt}.`,
    "",
    ...summaryLines(suite.summary).map((line) => `- ${line}`),
    "",
    caseTable(suite),
    "",
  ].join("\n");
}

export function comparisonTable(suites: readonly SuiteResult[]): string {
  return [
    "| model | pass rate | graded pass rate | mean judge | tokens | cost | p50 latency | p95 latency |",
    "|---|---|---|---|---|---|---|---|",
    ...suites.map((s) => {
      const m = s.summary;
      return `| ${label(s)} | ${pct(m.passRate)} (${m.passed}/${m.cases - m.skipped}) | ${pct(m.gradedPassRate)} (${m.passed}/${m.passed + m.failed}) | ${
        m.meanJudgeScore === null ? "n/a" : m.meanJudgeScore.toFixed(2)
      } | ${m.totalTokens} | ${usd(m.totalCostUsd)} | ${ms(m.requestLatencyP50Ms)} | ${ms(m.requestLatencyP95Ms)} |`;
    }),
  ].join("\n");
}

export function printSuite(suite: SuiteResult): void {
  console.log(`\n${label(suite)}\n`);
  console.log(caseTable(suite));
  console.log("");
  for (const line of summaryLines(suite.summary)) console.log(line);
}

const slug = (text: string) => text.replace(/[^a-z0-9.-]+/gi, "_");

/** Writes `<stamp>-<model>.json` and `.md`; returns their paths. */
export async function writeReports(
  dir: string,
  suites: readonly SuiteResult[],
  name?: string,
): Promise<string[]> {
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const base = join(
    dir,
    name ?? `${stamp}-${suites.length === 1 ? slug(label(suites[0]!)) : "matrix"}`,
  );
  const markdown =
    suites.length === 1
      ? markdownReport(suites[0]!)
      : [
          "# Coach eval: model matrix",
          "",
          comparisonTable(suites),
          "",
          ...suites.map((s) => markdownReport(s).replace(/^# /, "## ")),
        ].join("\n");
  await writeFile(`${base}.md`, markdown);
  await writeFile(
    `${base}.json`,
    `${JSON.stringify(suites.length === 1 ? suites[0] : suites, null, 2)}\n`,
  );
  return [`${base}.md`, `${base}.json`];
}
