import type { AssistantMessage, Models } from "@earendil-works/pi-ai";

import type { CaseRun, EvalCase, JudgeVerdict } from "./types.ts";

export const JUDGE_MARKER = "You grade one message written by Vitask";

/** The written rubric. Case rubrics add what this case is about; the scale and the output format stay fixed. */
export const JUDGE_SYSTEM = `${JUDGE_MARKER}, an AI focus coach inside a task and break-timer app. You get the situation the coach was in, a case-specific rubric, and the coach's message. Grade only the message.

General criteria, unless the case rubric overrides them:
- Short: chat answers a few sentences, one-shot messages within their stated length.
- Specific: it refers to the actual tasks, timers or history in the situation, not generic filler.
- Grounded: it never invents tasks, numbers, events or outcomes that are not in the situation; it never claims a change happened when the situation says it was rejected, expired or not made.
- Style: warm and lightly witty, not preachy; no em dashes or spaced hyphens.

Scale (integer):
5 = meets every criterion and the case rubric well.
4 = meets the case rubric with a minor style flaw.
3 = acceptable but generic, a bit long, or one notable flaw.
2 = misses an important part of the rubric.
1 = wrong, harmful, invents facts, or claims something false.

Reply with only a JSON object, no code fence: {"score": <1-5>, "reason": "<one sentence>"}`;

export const JUDGE_PASS_SCORE = 4;

export function situationOf(testCase: EvalCase, run: CaseRun): string {
  const d = testCase.drive;
  const tasks = run.tasksBefore.map((t) => ({
    title: t.title,
    status: t.status,
    ...(t.notes ? { notes: t.notes } : {}),
  }));
  const lines: string[] = [];
  switch (d.kind) {
    case "chat":
      lines.push(`The user wrote, in order: ${JSON.stringify(d.turns)}`);
      lines.push(`Tasks before: ${JSON.stringify(tasks)}`);
      if (run.memoryBefore.length > 0)
        lines.push(`Remembered facts: ${JSON.stringify(run.memoryBefore.map((m) => m.text))}`);
      lines.push(
        `Changes the coach proposed and what the user decided: ${JSON.stringify(
          run.approvals.map((a) => ({ change: a.summary, outcome: a.status })),
        )}`,
      );
      lines.push(`Tools the coach called: ${JSON.stringify(run.toolCalls.map((c) => c.name))}`);
      break;
    case "hype":
      lines.push(
        `The user just completed the task ${JSON.stringify(
          run.tasksBefore.find((t) => t.id === run.ids[d.task])?.title,
        )}. The message is a 1 to 2 sentence celebration.`,
      );
      break;
    case "nudge":
      lines.push(
        `A care timer fired during a focus session: ${JSON.stringify(d.timer)}. The message is a 1 to 2 sentence break nudge.`,
      );
      break;
    case "wrapup":
      lines.push(
        `A focus session ended. History: ${JSON.stringify({
          focusMinutes: d.focusMinutes,
          completedTasks: d.completed,
          openTasks: d.open,
          breaks: d.breaks,
        })}. The message is a 2 to 3 sentence debrief.`,
      );
      break;
  }
  return lines.join("\n");
}

/** Pulls the first JSON object out of a reply; models sometimes wrap it in prose or a fence. */
export function parseVerdict(text: string): JudgeVerdict | undefined {
  const match = /\{[\s\S]*\}/.exec(text);
  if (!match) return undefined;
  try {
    const value = JSON.parse(match[0]) as { score?: unknown; reason?: unknown };
    const score = Number(value.score);
    if (!Number.isInteger(score) || score < 1 || score > 5) return undefined;
    return {
      score,
      pass: score >= JUDGE_PASS_SCORE,
      reason: typeof value.reason === "string" ? value.reason : "",
    };
  } catch {
    return undefined;
  }
}

export type JudgeResult = { verdict: JudgeVerdict; tokens: number; costUsd: number };

export async function judge(
  models: Models,
  target: { provider: string; model: string },
  testCase: EvalCase,
  run: CaseRun,
): Promise<JudgeResult> {
  const model = models.getModel(target.provider, target.model);
  if (!model) throw new Error(`judge model ${target.provider}/${target.model} is not available`);
  const prompt = `Situation:\n${situationOf(testCase, run)}\n\nCase rubric: ${testCase.judge}\n\nThe coach's message:\n<<<\n${run.text}\n>>>`;
  let tokens = 0;
  let costUsd = 0;
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const message: AssistantMessage = await models.completeSimple(
      model,
      // The rubric is the system prompt; every judge model supports that role once pi-ai sends it as `system`.
      {
        systemPrompt: JUDGE_SYSTEM,
        messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
      },
      {
        maxTokens: 2000,
        reasoning: model.reasoning ? "low" : undefined,
        signal: AbortSignal.timeout(120_000),
      },
    );
    tokens += message.usage.input + message.usage.cacheRead + message.usage.output;
    costUsd += Number.isFinite(message.usage.cost.total) ? message.usage.cost.total : 0;
    last = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    if (message.stopReason === "error") last = `error: ${message.errorMessage ?? ""}`;
    const verdict = parseVerdict(last);
    if (verdict) return { verdict, tokens, costUsd };
  }
  return {
    verdict: { score: 1, pass: false, reason: `judge gave no verdict: ${last.slice(0, 200)}` },
    tokens,
    costUsd,
  };
}
