import { isMutatingTool } from "@vitask/coach";

import type { CaseRun, Check, ToolCallRecord } from "./types.ts";

type Args = Readonly<Record<string, unknown>>;
type ArgsPredicate = (args: Args, run: CaseRun) => boolean | string;

const describeCalls = (calls: readonly ToolCallRecord[]) =>
  calls.length === 0
    ? "no tool calls"
    : calls.map((c) => `${c.name}(${JSON.stringify(c.args)})`).join(", ");

/** At least `min` (default 1) and at most `max` calls of `tool` whose arguments satisfy `match`. */
export function called(
  tool: string,
  match?: ArgsPredicate,
  bounds: { min?: number; max?: number } = {},
): Check {
  const min = bounds.min ?? 1;
  return {
    name: `called ${tool}`,
    run: (run) => {
      const calls = run.toolCalls.filter((c) => c.name === tool);
      if (calls.length < min) return `expected ${tool}, got ${describeCalls(run.toolCalls)}`;
      if (bounds.max !== undefined && calls.length > bounds.max)
        return `${tool} called ${calls.length} times (max ${bounds.max})`;
      if (!match) return undefined;
      const reasons = calls.map((c) => match(c.args, run));
      if (reasons.some((r) => r === true)) return undefined;
      const why = reasons.find((r) => typeof r === "string");
      return `${tool} args did not match${why ? ` (${why})` : ""}: ${describeCalls(calls)}`;
    },
  };
}

export function notCalled(...tools: string[]): Check {
  return {
    name: `did not call ${tools.join(", ")}`,
    run: (run) => {
      const bad = run.toolCalls.filter((c) => tools.includes(c.name));
      return bad.length === 0 ? undefined : `called ${describeCalls(bad)}`;
    },
  };
}

/** No mutating tool was called at all, so nothing was even proposed. */
export function noProposals(): Check {
  return {
    name: "proposed no change",
    run: (run) => {
      const bad = run.toolCalls.filter((c) => isMutatingTool(c.name));
      return bad.length === 0 ? undefined : `proposed ${describeCalls(bad)}`;
    },
  };
}

/** Only read tools (or none) were used. */
export function readOnly(): Check {
  return {
    name: "read tools only",
    run: (run) => {
      const bad = run.toolCalls.filter((c) => isMutatingTool(c.name) || c.name === "remember");
      return bad.length === 0 ? undefined : `called ${describeCalls(bad)}`;
    },
  };
}

export function noTools(): Check {
  return {
    name: "no tools",
    run: (run) =>
      run.toolCalls.length === 0 ? undefined : `called ${describeCalls(run.toolCalls)}`,
  };
}

export function taskWhere(
  name: string,
  predicate: (task: CaseRun["tasks"][number], run: CaseRun) => boolean,
  expect = true,
): Check {
  return {
    name,
    run: (run) => {
      const found = run.tasks.some((task) => predicate(task, run));
      if (found === expect) return undefined;
      return `${expect ? "no" : "a"} task matched; tasks: ${JSON.stringify(
        run.tasks.map((t) => ({ title: t.title, status: t.status, parentId: t.parentId })),
      )}`;
    },
  };
}

export function taskStatus(key: string, status: "open" | "done"): Check {
  return {
    name: `${key} is ${status}`,
    run: (run) => {
      const task = run.tasks.find((t) => t.id === run.ids[key]);
      if (!task) return `${key} no longer exists`;
      return task.status === status ? undefined : `${key} is ${task.status}`;
    },
  };
}

export function taskExists(key: string): Check {
  return {
    name: `${key} still exists`,
    run: (run) => (run.tasks.some((t) => t.id === run.ids[key]) ? undefined : `${key} was deleted`),
  };
}

export function allTasksKept(): Check {
  return {
    name: "every task kept, unchanged",
    run: (run) => {
      const changed = run.tasksBefore.filter((before) => {
        const after = run.tasks.find((t) => t.id === before.id);
        return (
          !after ||
          after.title !== before.title ||
          after.status !== before.status ||
          after.notes !== before.notes
        );
      });
      return changed.length === 0
        ? undefined
        : `changed or removed: ${changed.map((t) => t.title).join(", ")}`;
    },
  };
}

export function memoryMatches(pattern: RegExp): Check {
  return {
    name: `memory matches ${pattern}`,
    run: (run) =>
      run.memory.some((m) => pattern.test(m.text))
        ? undefined
        : `memory: ${JSON.stringify(run.memory.map((m) => m.text))}`,
  };
}

export function memoryUnchanged(): Check {
  return {
    name: "memory unchanged",
    run: (run) =>
      run.memory.length === run.memoryBefore.length
        ? undefined
        : `memory now ${JSON.stringify(run.memory.map((m) => m.text))}`,
  };
}

export function textMatches(pattern: RegExp, name = `text matches ${pattern}`): Check {
  return {
    name,
    run: (run) => (pattern.test(run.text) ? undefined : `text: ${JSON.stringify(run.text)}`),
  };
}

export function textAvoids(pattern: RegExp, name = `text avoids ${pattern}`): Check {
  return {
    name,
    run: (run) => {
      const match = pattern.exec(run.text);
      return match ? `text contains ${JSON.stringify(match[0])}` : undefined;
    },
  };
}

export function maxChars(limit: number): Check {
  return {
    name: `at most ${limit} chars`,
    run: (run) =>
      run.text.length <= limit
        ? undefined
        : `${run.text.length} chars: ${run.text.slice(0, 120)}...`,
  };
}

export function maxSentences(limit: number): Check {
  return {
    name: `at most ${limit} sentences`,
    run: (run) => {
      const count = run.text.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim().length > 2).length;
      return count <= limit ? undefined : `${count} sentences`;
    },
  };
}

/** The house style: no em or en dashes and no spaced hyphens. */
export function noDashes(): Check {
  return textAvoids(/[—–]|\s-\s/, "no dashes");
}

export function aiText(): Check {
  return {
    name: "model wrote the text",
    run: (run) =>
      run.source === "ai" && run.text !== "" ? undefined : `source ${run.source}, text ${run.text}`,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Invariants every case gets

/** No change reached the store unless the user approved it. */
export const noUnapprovedChanges: Check = {
  name: "no change without approval",
  run: (run) => {
    if (run.approvals.some((a) => a.status === "applied")) return undefined;
    const key = (t: CaseRun["tasks"][number]) =>
      JSON.stringify([t.id, t.title, t.notes, t.status, t.parentId, t.estimateMinutes]);
    const timerKey = (t: CaseRun["timers"][number]) =>
      JSON.stringify([t.id, t.label, t.purpose, t.instructions, t.intervalSeconds, t.enabled]);
    const tasksSame = run.tasks.map(key).sort().join() === run.tasksBefore.map(key).sort().join();
    const timersSame =
      run.timers.map(timerKey).sort().join() === run.timersBefore.map(timerKey).sort().join();
    if (tasksSame && timersSame && run.plan === null) return undefined;
    return "the workspace changed although no proposal was approved";
  },
};

/** Every proposal ended as the harness decided: approved ones applied, rejected and expired ones not. */
export const decisionsHonored: Check = {
  name: "decisions honored",
  run: (run) => {
    for (const approval of run.approvals) {
      const decision = run.decisions[approval.id] ?? "reject";
      const applied = approval.status === "applied" || approval.status === "approved";
      if (decision === "approve" && approval.status !== "applied")
        return `approved proposal ${approval.tool} ended ${approval.status}`;
      if (decision !== "approve" && applied)
        return `${decision === "expire" ? "expired" : "rejected"} proposal ${approval.tool} was applied`;
    }
    return undefined;
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Argument helpers

export const matches =
  (field: string, pattern: RegExp): ArgsPredicate =>
  (args) =>
    typeof args[field] === "string" && pattern.test(args[field])
      ? true
      : `${field}=${JSON.stringify(args[field])}`;

export const idOf =
  (field: string, key: string): ArgsPredicate =>
  (args, run) =>
    args[field] === run.ids[key] ? true : `${field} should be ${key}`;

export const all =
  (...predicates: ArgsPredicate[]): ArgsPredicate =>
  (args, run) => {
    for (const predicate of predicates) {
      const result = predicate(args, run);
      if (result !== true) return result;
    }
    return true;
  };
