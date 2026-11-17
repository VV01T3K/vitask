import type { Context } from "@earendil-works/chord/context";
import { defineTask, type TaskRuntime } from "@earendil-works/pi-durable";

import type { CoachDeps } from "./deps.ts";
import { generateOneShot } from "./generate.ts";
import { endSession } from "./operations.ts";
import {
  handoffNote,
  HYPE_SYSTEM,
  hypePrompt,
  NUDGE_SYSTEM,
  nudgePrompt,
  WRAPUP_SYSTEM,
  wrapUpPrompt,
} from "./prompts.ts";

const ONE_SHOT_TOKENS = 600;

type AnyRuntime = TaskRuntime<unknown, { phase: string }, unknown, object>;

function done<R>(
  runtime: { commit: AnyRuntime["commit"] },
  result: R,
  context: Context,
): Promise<void> {
  return runtime.commit(
    () => ({ status: "terminal", outcome: { status: "completed", result } }),
    context,
  );
}

function aborted(runtime: { commit: AnyRuntime["commit"] }, context: Context): Promise<void> {
  return runtime.commit(() => ({ status: "terminal", outcome: { status: "aborted" } }), context);
}

/**
 * The coach's durable tasks, bound to one runtime's deps. Every phase may run again after a restart, so each one
 * checks the store before doing work and writes idempotently.
 */
export function createCoachTasks(deps: CoachDeps) {
  const { store } = deps;

  /** Fires one care timer for one session: sleeps to each fire time, writes a nudge, re-arms. */
  const CareTimer = defineTask<
    { timerId: string; sessionId: string; firstFireAt: number },
    { phase: "wait"; fireAt: number } | { phase: "fire"; fireAt: number },
    null
  >({
    name: "vitask.care-timer",
    version: 1,
    initial: (input) => ({ phase: "wait", fireAt: input.firstFireAt }),
    phases: {
      wait: (task, runtime, context) =>
        runtime.sleepUntil(
          task.state.checkpoint.fireAt,
          { phase: "fire", fireAt: task.state.checkpoint.fireAt },
          context,
        ),
      fire: async (task, runtime, context) => {
        const { timerId, sessionId } = task.input;
        const { fireAt } = task.state.checkpoint;
        const session = await store.getSession(sessionId);
        const timer = await store.getTimer(timerId);
        if (session?.status !== "active" || !timer?.enabled) return done(runtime, null, context);

        if (!(await store.hasNudge(timerId, fireAt))) {
          const completed = (await store.listTasks()).filter(
            (t) => t.completedAt !== null && t.completedAt >= session.startedAt,
          ).length;
          const { text, source } = await generateOneShot(deps, {
            trigger: "nudge",
            system: NUDGE_SYSTEM,
            prompt: nudgePrompt({ ...timer, completedThisSession: completed }),
            fallback: `${timer.purpose || timer.label}. Stand up, roll your shoulders and take a slow breath before diving back in.`,
            maxTokens: ONE_SHOT_TOKENS,
            runId: String(task.id),
          });
          const nudge = {
            id: deps.newId("nudge"),
            sessionId,
            timerId,
            timerLabel: timer.label,
            message: text,
            source,
            firedAt: fireAt,
          };
          if (await store.insertNudge(nudge)) deps.publish({ type: "nudge", nudge });
        }

        // After downtime longer than an interval, skip the missed fires instead of firing them in a burst.
        const interval = timer.intervalSeconds * 1000;
        const next = Math.max(fireAt + interval, runtime.now() + 1000);
        const updated = await store.updateTimer(timerId, {
          nextFireAt: next,
          updatedAt: runtime.now(),
        });
        if (updated) deps.publish({ type: "timer.upserted", timer: updated });
        await runtime.sleepUntil(next, { phase: "fire", fireAt: next }, context);
      },
    },
    abort: (_task, runtime, context) => aborted(runtime, context),
  });

  /** The coach's short celebration of a task the user completed; at most one per task. */
  const Hype = defineTask<{ taskId: string }, { phase: "write" }, null>({
    name: "vitask.hype",
    version: 1,
    initial: () => ({ phase: "write" }),
    phases: {
      write: async (task, runtime, context) => {
        const hype = await store.getHype(task.input.taskId);
        if (hype && hype.message === null) {
          const { text, source } = await generateOneShot(deps, {
            trigger: "hype",
            system: HYPE_SYSTEM,
            prompt: hypePrompt(hype.taskTitle),
            fallback: `Task cleared: "${hype.taskTitle}". Momentum secured.`,
            maxTokens: ONE_SHOT_TOKENS,
            runId: String(task.id),
          });
          const written = await store.setHypeMessage(hype.taskId, text, source);
          if (written) deps.publish({ type: "hype", hype: written });
        }
        await done(runtime, null, context);
      },
    },
    abort: (_task, runtime, context) => aborted(runtime, context),
  });

  /** Ends a session at its maximum length so timers never run unattended. */
  const SessionGuard = defineTask<
    { sessionId: string; endsAt: number },
    { phase: "wait" } | { phase: "end" },
    null
  >({
    name: "vitask.session-guard",
    version: 1,
    initial: () => ({ phase: "wait" }),
    phases: {
      wait: (task, runtime, context) =>
        runtime.sleepUntil(task.input.endsAt, { phase: "end" }, context),
      end: async (task, runtime, context) => {
        const session = await store.getSession(task.input.sessionId);
        if (session?.status === "active") await endSession(deps, "max_length", { fromGuard: true });
        await done(runtime, null, context);
      },
    },
    abort: (_task, runtime, context) => aborted(runtime, context),
  });

  /** Writes the debrief from the session's real history, then hands the coach a fresh context. */
  const WrapUp = defineTask<
    { sessionId: string },
    { phase: "debrief" } | { phase: "handoff" },
    null
  >({
    name: "vitask.wrap-up",
    version: 1,
    initial: () => ({ phase: "debrief" }),
    phases: {
      debrief: async (task, runtime, context) => {
        const session = await store.getSession(task.input.sessionId);
        if (!session) return done(runtime, null, context);
        if (session.debrief === null) {
          const end = session.endedAt ?? runtime.now();
          const tasks = await store.listTasks();
          const completed = tasks
            .filter(
              (t) =>
                t.completedAt !== null &&
                t.completedAt >= session.startedAt &&
                t.completedAt <= end,
            )
            .map((t) => t.title);
          const stillOpen = tasks
            .filter((t) => t.status === "open" && t.parentId === null)
            .map((t) => t.title);
          const nudges = await store.listNudges(session.id);
          const focusMinutes = Math.max(0, Math.round((end - session.startedAt) / 60_000));
          const { text, source } = await generateOneShot(deps, {
            trigger: "wrapup",
            system: WRAPUP_SYSTEM,
            prompt: wrapUpPrompt({
              focusMinutes,
              completed,
              stillOpen,
              nudges: nudges.map((n) => ({ timer: n.timerLabel, message: n.message })),
            }),
            fallback: `Session complete: ${focusMinutes} minutes of focus, ${completed.length} tasks done and ${nudges.length} breaks taken. A solid balance of deep work and resets.`,
            maxTokens: ONE_SHOT_TOKENS,
            runId: String(task.id),
          });
          const updated = await store.updateSession(session.id, {
            debrief: text,
            debriefSource: source,
          });
          if (updated) deps.publish({ type: "session.updated", session: updated });
        }
        await runtime.commit(
          () => ({ status: "running", checkpoint: { phase: "handoff" } }),
          context,
        );
      },
      handoff: async (task, runtime, context) => {
        const session = await store.getSession(task.input.sessionId);
        if (!session) return done(runtime, null, context);
        if ((await store.getSessionTasks(session.id)).handoffAt === null) {
          const tasks = await store.listTasks();
          const completed = tasks
            .filter((t) => t.completedAt !== null && t.completedAt >= session.startedAt)
            .map((t) => t.title);
          const stillOpen = tasks
            .filter((t) => t.status === "open" && t.parentId === null)
            .map((t) => t.title);
          await deps
            .root()
            .reset(handoffNote({ debrief: session.debrief ?? "", completed, stillOpen }), context);
          await store.setSessionTasks(session.id, { handoffAt: runtime.now() });
        }
        const ended = await store.transitionSession(session.id, "wrapping_up", { status: "ended" });
        if (ended) deps.publish({ type: "session.updated", session: ended });
        await done(runtime, null, context);
      },
    },
    abort: (_task, runtime, context) => aborted(runtime, context),
  });

  /**
   * Holds a gated tool call until the user decides: it sleeps until the approval expires, and the host aborts it to
   * wake the call early. pi-durable 1.5.2 has no signals, so an abort is the wake-up and the store holds the decision.
   */
  const ApprovalWait = defineTask<
    { approvalId: string; until: number },
    { phase: "wait" } | { phase: "expired" },
    "expired"
  >({
    name: "vitask.approval-wait",
    version: 1,
    initial: () => ({ phase: "wait" }),
    phases: {
      wait: (task, runtime, context) =>
        runtime.sleepUntil(task.input.until, { phase: "expired" }, context),
      expired: (_task, runtime, context) => done(runtime, "expired" as const, context),
    },
    abort: (_task, runtime, context) => aborted(runtime, context),
  });

  return { CareTimer, Hype, SessionGuard, WrapUp, ApprovalWait };
}

export type CoachTasks = ReturnType<typeof createCoachTasks>;
