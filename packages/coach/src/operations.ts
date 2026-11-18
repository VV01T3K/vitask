import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Task as DurableTask, TaskId } from "@earendil-works/pi-durable";
import {
  LIMITS,
  type CareTimer,
  type CreateTaskBody,
  type CreateTimerBody,
  type Session,
  type Task,
  type UpdateTaskBody,
  type UpdateTimerBody,
} from "@vitask/protocol";

import type { CoachDeps } from "./deps.ts";
import { CoachError } from "./errors.ts";

const ctx = BACKGROUND_CONTEXT;

// ---------------------------------------------------------------------------------------------------------------
// Durable task helpers

/** Creates a background task in the system conversation and returns its id. */
export async function spawn<I, S extends { phase: string }, R, H extends object>(
  deps: CoachDeps,
  task: DurableTask<I, S, R, H>,
  input: I,
): Promise<number> {
  await deps.beforeWork();
  const id = await deps
    .system()
    .commit(
      (tx) => tx.createTask(task, input, { ownership: { kind: "conversation" }, background: true }),
      ctx,
    );
  return Number(id);
}

/** Aborts a task unless it is already gone or terminal. Never call it on the calling task itself. */
export async function stopTask(deps: CoachDeps, id: number | null): Promise<void> {
  if (id === null) return;
  const record = await deps.harness().getTask(id as TaskId, ctx);
  if (record === undefined || record.state.status === "terminal") return;
  await deps.beforeWork();
  await deps.harness().abortTask(id as TaskId, ctx);
}

async function isLive(deps: CoachDeps, id: number | null): Promise<boolean> {
  if (id === null) return false;
  const record = await deps.harness().getTask(id as TaskId, ctx);
  return record !== undefined && record.state.status !== "terminal";
}

// ---------------------------------------------------------------------------------------------------------------
// Tasks

export type NewTask = CreateTaskBody;

async function nextOrder(deps: CoachDeps, parentId: string | null): Promise<number> {
  const siblings = (await deps.store.listTasks()).filter((task) => task.parentId === parentId);
  return siblings.reduce((max, task) => Math.max(max, task.order), 0) + 1;
}

/** Checks a new task (or step) against the store; returns why it cannot be created, or undefined. */
export async function taskProblem(
  deps: CoachDeps,
  input: NewTask,
  extra = 1,
): Promise<string | undefined> {
  if ((await deps.store.countTasks()) + extra > LIMITS.tasksTotal) {
    return `A workspace holds at most ${LIMITS.tasksTotal} tasks.`;
  }
  if (input.parentId) {
    const parent = await deps.store.getTask(input.parentId);
    if (!parent) return `No task with id ${input.parentId}.`;
    if (parent.parentId !== null) return "Steps cannot have steps of their own.";
    const steps = (await deps.store.listTasks()).filter(
      (task) => task.parentId === parent.id,
    ).length;
    if (steps + extra > LIMITS.stepsPerTask)
      return `A task has at most ${LIMITS.stepsPerTask} steps.`;
  }
  return undefined;
}

export async function createTask(deps: CoachDeps, input: NewTask, id?: string): Promise<Task> {
  if (id !== undefined) {
    const existing = await deps.store.getTask(id);
    if (existing) return existing;
  }
  const problem = await taskProblem(deps, input);
  if (problem)
    throw new CoachError(problem.startsWith("No task") ? "not_found" : "limit_reached", problem);
  const now = deps.now();
  const parentId = input.parentId ?? null;
  const task: Task = {
    id: id ?? deps.newId("task"),
    title: input.title.trim(),
    notes: input.notes ?? "",
    status: "open",
    parentId,
    estimateMinutes: input.estimateMinutes ?? null,
    order: await nextOrder(deps, parentId),
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  await deps.store.insertTask(task);
  deps.publish({ type: "task.upserted", task });
  return task;
}

async function requireTask(deps: CoachDeps, id: string): Promise<Task> {
  const task = await deps.store.getTask(id);
  if (!task) throw new CoachError("not_found", `No task with id ${id}.`);
  return task;
}

/**
 * Updates a task. Completing it records `completedAt`; when the user does it directly (`hype`), the coach writes
 * a short celebration, once per task.
 */
export async function updateTask(
  deps: CoachDeps,
  id: string,
  patch: UpdateTaskBody,
  options: { hype: boolean },
): Promise<Task> {
  const before = await requireTask(deps, id);
  const now = deps.now();
  const completing = patch.status === "done" && before.status !== "done";
  const reopening = patch.status === "open" && before.status === "done";
  const task = await deps.store.updateTask(id, {
    ...patch,
    ...(completing ? { completedAt: now } : reopening ? { completedAt: null } : {}),
    updatedAt: now,
  });
  if (!task) throw new CoachError("not_found", `No task with id ${id}.`);
  deps.publish({ type: "task.upserted", task });
  if (completing && options.hype) await startHype(deps, task);
  return task;
}

export async function deleteTask(deps: CoachDeps, id: string): Promise<string[]> {
  const removed = await deps.store.deleteTask(id);
  if (removed.length === 0) throw new CoachError("not_found", `No task with id ${id}.`);
  for (const taskId of removed) deps.publish({ type: "task.deleted", id: taskId });
  return removed;
}

async function startHype(deps: CoachDeps, task: Task): Promise<void> {
  const session = await deps.store.getActiveSession();
  const claimed = await deps.store.claimHype({
    taskId: task.id,
    taskTitle: task.title,
    sessionId: session?.id ?? null,
    message: null,
    source: null,
    createdAt: deps.now(),
  });
  if (!claimed) return;
  await spawn(deps, deps.tasks().Hype, { taskId: task.id });
}

// ---------------------------------------------------------------------------------------------------------------
// Care timers

export const DEFAULT_TIMERS = [
  {
    label: "Hydration",
    purpose: "Drink some water",
    instructions:
      "When this fires, remind me to drink water. Keep it punchy, warm, and energizing.",
    intervalSeconds: 60 * 60,
    icon: "hydration",
    color: "#4f8fea",
  },
  {
    label: "Eye Rest (20-20-20)",
    purpose: "Look 20 feet away for 20 seconds",
    instructions:
      "When this fires, remind me to look 20 feet away for 20 seconds and reset my eyes.",
    intervalSeconds: 20 * 60,
    icon: "sun",
    color: "#41b06e",
  },
] as const;

/** Inserts the v1 default timers the first time a workspace opens. */
export async function seedWorkspace(deps: CoachDeps): Promise<void> {
  if ((await deps.store.getMeta("seeded")) !== undefined) return;
  const now = deps.now();
  for (const [index, timer] of DEFAULT_TIMERS.entries()) {
    await deps.store.insertTimer({
      ...timer,
      id: deps.newId("timer"),
      enabled: true,
      isDefault: true,
      nextFireAt: null,
      createdAt: now + index,
      updatedAt: now + index,
    });
  }
  await deps.store.setMeta("seeded", String(now));
}

function checkInterval(deps: CoachDeps, seconds: number | undefined): void {
  if (seconds !== undefined && seconds < deps.config.minTimerIntervalSeconds) {
    throw new CoachError(
      "bad_request",
      `Timers fire at most every ${deps.config.minTimerIntervalSeconds} seconds.`,
    );
  }
}

export async function createTimer(
  deps: CoachDeps,
  body: CreateTimerBody,
  id?: string,
): Promise<CareTimer> {
  if (id !== undefined) {
    const existing = await deps.store.getTimer(id);
    if (existing) return existing;
  }
  checkInterval(deps, body.intervalSeconds);
  if ((await deps.store.listTimers()).length >= LIMITS.timersTotal) {
    throw new CoachError(
      "limit_reached",
      `A workspace holds at most ${LIMITS.timersTotal} timers.`,
    );
  }
  const now = deps.now();
  const timer: CareTimer = {
    id: id ?? deps.newId("timer"),
    label: body.label.trim(),
    purpose: body.purpose ?? "",
    instructions: body.instructions ?? "",
    intervalSeconds: body.intervalSeconds,
    enabled: body.enabled ?? true,
    icon: body.icon ?? "clock",
    color: body.color ?? "#4f8fea",
    isDefault: false,
    nextFireAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await deps.store.insertTimer(timer);
  deps.publish({ type: "timer.upserted", timer });
  const session = await deps.store.getActiveSession();
  if (session?.status === "active" && timer.enabled) return armTimer(deps, session, timer);
  return timer;
}

export async function updateTimer(
  deps: CoachDeps,
  id: string,
  patch: UpdateTimerBody,
): Promise<CareTimer> {
  checkInterval(deps, patch.intervalSeconds);
  const before = await deps.store.getTimer(id);
  if (!before) throw new CoachError("not_found", `No timer with id ${id}.`);
  let timer = await deps.store.updateTimer(id, { ...patch, updatedAt: deps.now() });
  if (!timer) throw new CoachError("not_found", `No timer with id ${id}.`);
  const reschedule =
    patch.enabled !== undefined ||
    (patch.intervalSeconds !== undefined && patch.intervalSeconds !== before.intervalSeconds);
  const session = await deps.store.getActiveSession();
  if (reschedule && session?.status === "active") {
    timer = await disarmTimer(deps, id);
    if (timer.enabled) timer = await armTimer(deps, session, timer);
  } else {
    deps.publish({ type: "timer.upserted", timer });
  }
  return timer;
}

export async function deleteTimer(deps: CoachDeps, id: string): Promise<void> {
  if (!(await deps.store.getTimer(id)))
    throw new CoachError("not_found", `No timer with id ${id}.`);
  await stopTask(deps, await deps.store.getTimerTask(id));
  await deps.store.deleteTimer(id);
  deps.publish({ type: "timer.deleted", id });
}

/** Starts the durable task that fires this timer during `session`. */
async function armTimer(deps: CoachDeps, session: Session, timer: CareTimer): Promise<CareTimer> {
  const firstFireAt = deps.now() + timer.intervalSeconds * 1000;
  const updated =
    (await deps.store.updateTimer(timer.id, { nextFireAt: firstFireAt, updatedAt: deps.now() })) ??
    timer;
  const taskId = await spawn(deps, deps.tasks().CareTimer, {
    timerId: timer.id,
    sessionId: session.id,
    firstFireAt,
  });
  await deps.store.setTimerTask(timer.id, taskId);
  deps.publish({ type: "timer.upserted", timer: updated });
  return updated;
}

async function disarmTimer(deps: CoachDeps, timerId: string): Promise<CareTimer> {
  await stopTask(deps, await deps.store.getTimerTask(timerId));
  await deps.store.setTimerTask(timerId, null);
  const timer = await deps.store.updateTimer(timerId, { nextFireAt: null, updatedAt: deps.now() });
  if (!timer) throw new CoachError("not_found", `No timer with id ${timerId}.`);
  deps.publish({ type: "timer.upserted", timer });
  return timer;
}

// ---------------------------------------------------------------------------------------------------------------
// Sessions

export async function startSession(deps: CoachDeps): Promise<Session> {
  const current = await deps.store.getActiveSession();
  if (current) return current;
  const now = deps.now();
  const session: Session = {
    id: deps.newId("session"),
    status: "active",
    startedAt: now,
    endedAt: null,
    endReason: null,
    maxEndsAt: now + deps.config.maxSessionMs,
    debrief: null,
    debriefSource: null,
  };
  await deps.store.insertSession(session);
  deps.publish({ type: "session.updated", session });
  await reconcile(deps);
  return session;
}

/**
 * Ends the active session: stops its timers and guard, expires waiting approvals, and starts the durable wrap-up.
 * Safe to race: only the caller that moves the session out of `active` does the work.
 */
export async function endSession(
  deps: CoachDeps,
  reason: "user" | "max_length",
  options: { fromGuard?: boolean } = {},
): Promise<Session> {
  const current = await deps.store.getActiveSession();
  if (!current) throw new CoachError("no_active_session", "There is no active session.");
  if (current.status !== "active") return current;
  const session = await deps.store.transitionSession(current.id, "active", {
    status: "wrapping_up",
    endedAt: deps.now(),
    endReason: reason,
  });
  if (!session) return (await deps.store.getSession(current.id)) ?? current;
  deps.publish({ type: "session.updated", session });

  for (const timer of await deps.store.listTimers()) {
    if (timer.nextFireAt !== null || (await deps.store.getTimerTask(timer.id)) !== null) {
      await disarmTimer(deps, timer.id);
    }
  }
  if (!options.fromGuard)
    await stopTask(deps, (await deps.store.getSessionTasks(session.id)).guardTaskId);
  await expirePendingApprovals(deps, "The session ended before a decision.");
  await reconcile(deps);
  return session;
}

/** Marks every pending approval expired and wakes the tool calls waiting on them. */
export async function expirePendingApprovals(deps: CoachDeps, result: string): Promise<void> {
  for (const pending of await deps.store.listApprovals({ status: "pending", limit: 100 })) {
    const approval = await deps.store.transitionApproval(pending.id, ["pending"], {
      status: "expired",
      decidedAt: deps.now(),
      result,
    });
    if (!approval) continue;
    deps.publish({ type: "approval.upserted", approval });
    await stopTask(deps, await deps.store.getApprovalWaitTask(approval.id));
  }
}

/**
 * Brings durable tasks in line with the store: an active session has a guard and one task per enabled timer, and a
 * session that is wrapping up has a wrap-up task. Runs at open and after session changes, so a crash between a store
 * write and a task creation heals at the next start.
 */
export async function reconcile(deps: CoachDeps): Promise<void> {
  const session = await deps.store.getActiveSession();
  if (!session) return;
  const tasks = await deps.store.getSessionTasks(session.id);
  if (session.status === "active") {
    if (!(await isLive(deps, tasks.guardTaskId))) {
      const guardTaskId = await spawn(deps, deps.tasks().SessionGuard, {
        sessionId: session.id,
        endsAt: session.maxEndsAt,
      });
      await deps.store.setSessionTasks(session.id, { guardTaskId });
    }
    for (const timer of await deps.store.listTimers()) {
      if (timer.enabled && !(await isLive(deps, await deps.store.getTimerTask(timer.id)))) {
        await armTimer(deps, session, timer);
      }
    }
  } else if (session.status === "wrapping_up" && !(await isLive(deps, tasks.wrapUpTaskId))) {
    const wrapUpTaskId = await spawn(deps, deps.tasks().WrapUp, { sessionId: session.id });
    await deps.store.setSessionTasks(session.id, { wrapUpTaskId });
  }
}
