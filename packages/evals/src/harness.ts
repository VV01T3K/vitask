import type { Models } from "@earendil-works/pi-ai";
import { MemoryStorage } from "@earendil-works/pi-durable";
import { CoachRuntime, InMemoryWorkspaceStore, type CoachConfig } from "@vitask/coach";
import type { ServerEvent, Task } from "@vitask/protocol";

import { decisionsHonored, noUnapprovedChanges } from "./checks.ts";
import type { CaseRun, Decision, EvalCase, ToolCallRecord } from "./types.ts";

export type RunOptions = {
  readonly models: Models;
  readonly provider: string;
  readonly model: string;
  /** Overall limit for one case, approval waits and rate-limit waits included. */
  readonly timeoutMs?: number;
  /** Called when the case starts; the faux mode queues the case's script here. */
  readonly onStart?: (testCase: EvalCase, ids: Record<string, string>) => void;
};

export type CaseOutcome = {
  readonly run: CaseRun | null;
  readonly failures: string[];
  readonly durationMs: number;
  readonly error: string | null;
};

const EXPIRE_TTL_MS = 4_000;
const DECIDE_DELAY_MS = 150;

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function waitFor<T>(
  probe: () => Promise<T | undefined>,
  timeoutMs: number,
  what: string,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`${what} timed out`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * Runs one case against the real coach: a `CoachRuntime` on pi-durable `MemoryStorage` and the in-memory workspace
 * store, the same code the Durable Object runs. Proposals are decided through `runtime.decideApproval`, the call the
 * UI's `approval.decide` command makes.
 */
export async function runCase(testCase: EvalCase, options: RunOptions): Promise<CaseOutcome> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 300_000;
  const decisions: Record<string, Decision> = {};
  const queue = [...(testCase.approvals ?? [])];
  const holder: { runtime?: CoachRuntime } = {};
  const decideErrors: string[] = [];

  const publish = (event: ServerEvent) => {
    if (event.type !== "approval.upserted" || event.approval.status !== "pending") return;
    const id = event.approval.id;
    if (decisions[id] !== undefined) return;
    const decision = queue.shift() ?? "reject";
    decisions[id] = decision;
    if (decision === "expire") return;
    setTimeout(() => {
      holder.runtime
        ?.decideApproval(id, decision)
        .catch((error: unknown) => decideErrors.push(String(error)));
    }, DECIDE_DELAY_MS);
  };

  const config: Partial<CoachConfig> = {
    provider: options.provider,
    model: options.model,
    minTimerIntervalSeconds: 0,
    approvalTtlMs: testCase.approvals?.includes("expire") ? EXPIRE_TTL_MS : 10 * 60_000,
  };
  const store = new InMemoryWorkspaceStore();
  const runtime = await CoachRuntime.open({
    storage: new MemoryStorage(),
    store,
    models: options.models,
    publish,
    config,
  });
  holder.runtime = runtime;
  runtime.resume();

  try {
    const ids = await applySetup(testCase, runtime, store);
    options.onStart?.(testCase, ids);
    const tasksBefore = await store.listTasks();
    const timersBefore = await store.listTimers();
    const memoryBefore = await store.listMemory();

    const drive = async (): Promise<{ text: string; source: CaseRun["source"] }> => {
      const { drive: d } = testCase;
      switch (d.kind) {
        case "chat": {
          for (const [index, text] of d.turns.entries()) {
            await runtime.chat(text, `${testCase.id}-${index}-${started}`.slice(0, 60));
            await runtime.waitForCoachIdle();
          }
          const entries = (await runtime.snapshot()).coach.entries;
          const last = entries.findLast((e) => e.role === "assistant" && e.text !== "");
          return { text: last?.text ?? "", source: null };
        }
        case "hype": {
          const id = ids[d.task];
          if (!id) throw new Error(`unknown task key ${d.task}`);
          await runtime.completeTask(id);
          const hype = await waitFor(
            async () => {
              const h = await store.getHype(id);
              return h?.message ? h : undefined;
            },
            timeoutMs,
            "hype",
          );
          return { text: hype.message ?? "", source: hype.source };
        }
        case "nudge": {
          for (const timer of await store.listTimers())
            await runtime.updateTimer(timer.id, { enabled: false });
          const timer = await runtime.createTimer({ ...d.timer, intervalSeconds: 1 });
          const session = await runtime.startSession();
          const nudge = await waitFor(
            async () => (await store.listNudges(session.id))[0],
            timeoutMs,
            "nudge",
          );
          await runtime.updateTimer(timer.id, { enabled: false });
          return { text: nudge.message, source: nudge.source };
        }
        case "wrapup": {
          const session = await seedSession(runtime, store, d);
          const ended = await runtime.endSession(timeoutMs);
          if (ended.debrief === null) {
            const done = await waitFor(
              async () => {
                const s = await store.getSession(session);
                return s?.debrief ? s : undefined;
              },
              timeoutMs,
              "debrief",
            );
            return { text: done.debrief ?? "", source: done.debriefSource };
          }
          return { text: ended.debrief, source: ended.debriefSource };
        }
      }
    };

    const { text, source } = await withTimeout(drive(), timeoutMs, `case ${testCase.id}`);
    const snapshot = await runtime.snapshot();
    const entries = snapshot.coach.entries;
    const toolCalls: ToolCallRecord[] = entries.flatMap((entry) =>
      entry.role !== "assistant"
        ? []
        : entry.toolCalls.map((call) => {
            const result = entries.find((e) => e.role === "tool" && e.toolCallId === call.id);
            return {
              name: call.name,
              args: (call.args ?? {}) as Record<string, unknown>,
              result: result?.text ?? null,
              isError: result?.isError ?? false,
            };
          }),
    );
    const run: CaseRun = {
      ids,
      entries,
      toolCalls,
      approvals: await store.listApprovals({ limit: 100 }),
      decisions,
      tasksBefore,
      tasks: await store.listTasks(),
      timersBefore,
      timers: await store.listTimers(),
      memoryBefore,
      memory: await store.listMemory(),
      plan: (await store.getPlan()) ?? null,
      text,
      source,
      turns: await store.listTurns(500),
    };

    const failures: string[] = decideErrors.map((e) => `decide failed: ${e}`);
    const errored = run.turns.filter((t) => t.outcome !== "ok");
    if (errored.length > 0)
      failures.push(
        `model request failed: ${errored.map((t) => `${t.outcome} ${t.error ?? ""}`.trim()).join("; ")}`,
      );
    if (testCase.drive.kind === "chat" && text === "") failures.push("the coach gave no answer");
    // In one-shot cases the user changes the workspace directly, so the approval invariants apply to chat only.
    const invariants =
      testCase.drive.kind === "chat" ? [noUnapprovedChanges, decisionsHonored] : [];
    for (const check of [...invariants, ...testCase.checks]) {
      const failure = check.run(run);
      if (failure !== undefined) failures.push(`${check.name}: ${failure}`);
    }
    return { run, failures, durationMs: Date.now() - started, error: null };
  } catch (error) {
    return {
      run: null,
      failures: [],
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await runtime.close().catch(() => undefined);
  }
}

async function applySetup(
  testCase: EvalCase,
  runtime: CoachRuntime,
  store: InMemoryWorkspaceStore,
): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const timer of await store.listTimers()) ids[`timer:${timer.label}`] = timer.id;
  for (const task of testCase.setup?.tasks ?? []) {
    const created = await runtime.createTask({
      title: task.title,
      ...(task.notes === undefined ? {} : { notes: task.notes }),
      ...(task.parent === undefined ? {} : { parentId: ids[task.parent] }),
      ...(task.estimateMinutes === undefined ? {} : { estimateMinutes: task.estimateMinutes }),
    });
    ids[task.key] = created.id;
    // Directly, so setup does not trigger a hype request.
    if (task.status === "done")
      await store.updateTask(created.id, {
        status: "done",
        completedAt: Date.now() - 3_600_000,
        updatedAt: Date.now(),
      });
  }
  for (const [index, fact] of (testCase.setup?.memory ?? []).entries()) {
    await store.insertMemory({ id: `fact_eval_${index}`, text: fact, createdAt: Date.now() });
  }
  return ids;
}

/** A session that already ran `focusMinutes` with this history, written straight into the store. */
async function seedSession(
  runtime: CoachRuntime,
  store: InMemoryWorkspaceStore,
  d: Extract<EvalCase["drive"], { kind: "wrapup" }>,
): Promise<string> {
  const now = Date.now();
  const startedAt = now - d.focusMinutes * 60_000;
  const id = "session_eval";
  await store.insertSession({
    id,
    status: "active",
    startedAt,
    endedAt: null,
    endReason: null,
    maxEndsAt: now + 3_600_000,
    debrief: null,
    debriefSource: null,
  });
  for (const [index, title] of d.completed.entries()) {
    const task = await runtime.createTask({ title });
    const completedAt = startedAt + ((index + 1) * (now - startedAt)) / (d.completed.length + 1);
    await store.updateTask(task.id, {
      status: "done",
      completedAt: Math.round(completedAt),
      updatedAt: now,
    } satisfies Partial<Task> & { updatedAt: number });
  }
  for (const title of d.open) await runtime.createTask({ title });
  const timers = await store.listTimers();
  for (const [index, label] of d.breaks.entries()) {
    const timer = timers.find((t) => t.label === label) ?? timers[0];
    if (!timer) break;
    await store.insertNudge({
      id: `nudge_eval_${index}`,
      sessionId: id,
      timerId: timer.id,
      timerLabel: label,
      message: "Take a short break.",
      source: "ai",
      firedAt: startedAt + (index + 1) * 600_000,
    });
  }
  return id;
}
