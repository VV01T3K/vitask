import type { AssistantMessage } from "@earendil-works/pi-ai";
import type {
  Approval,
  CareTimer,
  CoachEntry,
  FocusPlan,
  MemoryFact,
  Task,
  TurnLogEntry,
} from "@vitask/protocol";

export const CATEGORIES = [
  "tool_selection",
  "read_only",
  "approval",
  "memory",
  "injection",
  "scope",
  "text_quality",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** What the harness does with each proposal, in order; proposals past the list are rejected. */
export type Decision = "approve" | "reject" | "expire";

export type SetupTask = {
  /** Name a check or a faux script uses to find the task's generated id. */
  readonly key: string;
  readonly title: string;
  readonly notes?: string;
  readonly status?: "open" | "done";
  readonly parent?: string;
  readonly estimateMinutes?: number;
};

export type Setup = {
  readonly tasks?: readonly SetupTask[];
  readonly memory?: readonly string[];
};

export type Drive =
  | { readonly kind: "chat"; readonly turns: readonly string[] }
  /** The user completes this task key directly; the coach writes a hype. */
  | { readonly kind: "hype"; readonly task: string }
  /** A care timer fires once during a session; the coach writes a nudge. */
  | {
      readonly kind: "nudge";
      readonly timer: { label: string; purpose: string; instructions: string };
    }
  /** A session with this history ends; the coach writes the debrief. */
  | {
      readonly kind: "wrapup";
      readonly focusMinutes: number;
      readonly completed: readonly string[];
      readonly open: readonly string[];
      readonly breaks: readonly string[];
    };

/** Everything a check can look at after a case ran. */
export type CaseRun = {
  readonly ids: Readonly<Record<string, string>>;
  readonly entries: readonly CoachEntry[];
  readonly toolCalls: readonly ToolCallRecord[];
  readonly approvals: readonly Approval[];
  /** What the harness decided for each approval id. */
  readonly decisions: Readonly<Record<string, Decision>>;
  readonly tasksBefore: readonly Task[];
  readonly tasks: readonly Task[];
  readonly timersBefore: readonly CareTimer[];
  readonly timers: readonly CareTimer[];
  readonly memoryBefore: readonly MemoryFact[];
  readonly memory: readonly MemoryFact[];
  readonly plan: FocusPlan | null;
  /** The last assistant message of a chat case, or the hype, nudge or debrief text. */
  readonly text: string;
  /** For one-shot cases: whether the text came from the model or the canned fallback. */
  readonly source: "ai" | "fallback" | null;
  readonly turns: readonly TurnLogEntry[];
};

export type ToolCallRecord = {
  readonly name: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly result: string | null;
  readonly isError: boolean;
};

export type Check = {
  readonly name: string;
  /** Returns a failure reason, or undefined when the check passes. */
  readonly run: (run: CaseRun) => string | undefined;
};

/** A scripted coach step for `--faux`: a fixed message, or one built from the case's generated ids. */
export type FauxStep =
  | AssistantMessage
  | ((ids: Readonly<Record<string, string>>) => AssistantMessage);

export type EvalCase = {
  readonly id: string;
  readonly category: Category;
  readonly description: string;
  readonly setup?: Setup;
  readonly drive: Drive;
  readonly approvals?: readonly Decision[];
  readonly checks: readonly Check[];
  /** Case-specific rubric for the LLM judge; only text-quality questions go here. */
  readonly judge?: string;
  /** Scripted model output for `--faux`; cases without it do not run in faux mode. */
  readonly faux?: { readonly chat?: readonly FauxStep[]; readonly text?: string };
};

export type JudgeVerdict = { score: number; pass: boolean; reason: string };

export type CaseResult = {
  readonly id: string;
  readonly category: Category;
  readonly status: "pass" | "fail" | "error" | "skipped";
  readonly failures: readonly string[];
  readonly judge: JudgeVerdict | null;
  readonly toolCalls: readonly string[];
  readonly text: string;
  /** The coach conversation, one line per entry, for reading a failure. */
  readonly transcript: readonly string[];
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
  /** Wall time of the case, approvals included. */
  readonly durationMs: number;
  /** Latency of each model request the coach made. */
  readonly requestLatenciesMs: readonly number[];
  readonly judgeTokens: number;
  readonly judgeCostUsd: number;
  readonly error: string | null;
};
