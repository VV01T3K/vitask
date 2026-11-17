import { arr, bool, int, obj, opt, str, type Static } from "@earendil-works/pi-schema";
import { LIMITS, type FocusPlan, type MutatingTool } from "@vitask/protocol";

import type { CoachDeps } from "./deps.ts";
import {
  createTask,
  createTimer,
  deleteTask,
  taskProblem,
  updateTask,
  updateTimer,
} from "./operations.ts";

const taskId = str({ description: "Task id from list_tasks", minLength: 1, maxLength: 64 });
const title = str({ minLength: 1, maxLength: LIMITS.taskTitle });
const minutes = int({ minimum: 1, maximum: LIMITS.estimateMinutes });

/**
 * A change the coach can propose. `problem` rejects a call before the user is asked; `describe` is the approval's
 * summary; `apply` runs after approval and is idempotent for one approval (`seed`), because a restart can run it again.
 */
type Action<P extends object> = {
  readonly description: string;
  readonly parameters: P;
  problem(args: Static<P>, deps: CoachDeps): Promise<string | undefined>;
  describe(args: Static<P>, deps: CoachDeps): Promise<string>;
  apply(args: Static<P>, deps: CoachDeps, seed: string): Promise<string>;
};

function action<P extends object>(definition: Action<P>): Action<P> {
  return definition;
}

const quote = (text: string) => JSON.stringify(text.length > 80 ? `${text.slice(0, 77)}...` : text);

async function taskTitle(deps: CoachDeps, id: string): Promise<string | undefined> {
  return (await deps.store.getTask(id))?.title;
}

async function missingTask(deps: CoachDeps, id: string): Promise<string | undefined> {
  return (await deps.store.getTask(id))
    ? undefined
    : `No task with id ${id}. Call list_tasks for valid ids.`;
}

export const ACTIONS = {
  add_task: action({
    description: "Propose adding a task, or a step under a top-level task (parentId).",
    parameters: obj({
      title,
      notes: opt(str({ maxLength: LIMITS.taskNotes })),
      parentId: opt(taskId),
      estimateMinutes: opt(minutes),
    }),
    problem: (args, deps) => taskProblem(deps, args),
    describe: async (args, deps) => {
      const parent = args.parentId ? await taskTitle(deps, args.parentId) : undefined;
      const estimate = args.estimateMinutes ? ` (${args.estimateMinutes} min)` : "";
      return parent
        ? `Add step ${quote(args.title)}${estimate} under ${quote(parent)}`
        : `Add task ${quote(args.title)}${estimate}`;
    },
    apply: async (args, deps, seed) => {
      const task = await createTask(deps, args, `task_${seed}`);
      return `Added task ${task.id}: ${quote(task.title)}.`;
    },
  }),

  update_task: action({
    description: "Propose renaming a task, changing its notes, or its estimate.",
    parameters: obj({
      taskId,
      title: opt(title),
      notes: opt(str({ maxLength: LIMITS.taskNotes })),
      estimateMinutes: opt(minutes),
    }),
    problem: async (args, deps) =>
      (await missingTask(deps, args.taskId)) ??
      (args.title === undefined && args.notes === undefined && args.estimateMinutes === undefined
        ? "Nothing to change."
        : undefined),
    describe: async (args, deps) => {
      const changes = [
        args.title !== undefined ? `rename to ${quote(args.title)}` : undefined,
        args.notes !== undefined ? "replace its notes" : undefined,
        args.estimateMinutes !== undefined
          ? `set estimate to ${args.estimateMinutes} min`
          : undefined,
      ].filter(Boolean);
      return `Update ${quote((await taskTitle(deps, args.taskId)) ?? args.taskId)}: ${changes.join(", ")}`;
    },
    apply: async (args, deps) => {
      const { taskId: id, ...patch } = args;
      const task = await updateTask(deps, id, patch, { hype: false });
      return `Updated task ${task.id}.`;
    },
  }),

  complete_task: action({
    description:
      "Propose marking a task done, also when the user says they finished or did what the task describes.",
    parameters: obj({ taskId }),
    problem: async (args, deps) => {
      const task = await deps.store.getTask(args.taskId);
      if (!task) return missingTask(deps, args.taskId);
      return task.status === "done" ? "That task is already done." : undefined;
    },
    describe: async (args, deps) =>
      `Mark ${quote((await taskTitle(deps, args.taskId)) ?? args.taskId)} done`,
    apply: async (args, deps) => {
      const task = await updateTask(deps, args.taskId, { status: "done" }, { hype: false });
      return `Completed task ${task.id}.`;
    },
  }),

  delete_task: action({
    description: "Propose deleting a task and its steps.",
    parameters: obj({ taskId }),
    problem: (args, deps) => missingTask(deps, args.taskId),
    describe: async (args, deps) => {
      const steps = (await deps.store.listTasks()).filter((t) => t.parentId === args.taskId).length;
      const name = quote((await taskTitle(deps, args.taskId)) ?? args.taskId);
      return steps > 0 ? `Delete ${name} and its ${steps} steps` : `Delete ${name}`;
    },
    apply: async (args, deps) => {
      if (!(await deps.store.getTask(args.taskId))) return "Already deleted.";
      const removed = await deleteTask(deps, args.taskId);
      return `Deleted ${removed.length} task(s).`;
    },
  }),

  break_down_task: action({
    description: "Propose splitting a top-level task into ordered steps.",
    parameters: obj({
      taskId,
      steps: arr(obj({ title, estimateMinutes: opt(minutes) }), {
        minItems: 1,
        maxItems: LIMITS.stepsPerTask,
      }),
    }),
    problem: async (args, deps) =>
      (await missingTask(deps, args.taskId)) ??
      (await taskProblem(deps, { title: "step", parentId: args.taskId }, args.steps.length)),
    describe: async (args, deps) =>
      `Break ${quote((await taskTitle(deps, args.taskId)) ?? args.taskId)} into ${args.steps.length} steps: ${args.steps
        .map((step) => quote(step.title))
        .join(", ")}`,
    apply: async (args, deps, seed) => {
      for (const [index, step] of args.steps.entries()) {
        await createTask(deps, { ...step, parentId: args.taskId }, `task_${seed}_${index}`);
      }
      return `Added ${args.steps.length} steps.`;
    },
  }),

  plan_focus_blocks: action({
    description:
      "Propose an ordered plan of focus blocks over open tasks with minute estimates. Estimate the minutes yourself (respect remembered preferences such as block length). Approved, it becomes the current plan, sets the estimates and orders the tasks.",
    parameters: obj({
      blocks: arr(obj({ taskId, minutes, note: opt(str({ maxLength: 200 })) }), {
        minItems: 1,
        maxItems: LIMITS.planBlocks,
      }),
    }),
    problem: async (args, deps) => {
      for (const block of args.blocks) {
        const task = await deps.store.getTask(block.taskId);
        if (!task) return missingTask(deps, block.taskId);
        if (task.status === "done") return `Task ${block.taskId} is already done.`;
      }
      return undefined;
    },
    describe: async (args, deps) => {
      const parts = await Promise.all(
        args.blocks.map(
          async (b) => `${quote((await taskTitle(deps, b.taskId)) ?? b.taskId)} ${b.minutes} min`,
        ),
      );
      const total = args.blocks.reduce((sum, b) => sum + b.minutes, 0);
      return `Plan ${args.blocks.length} focus blocks (${total} min): ${parts.join(", ")}`;
    },
    apply: async (args, deps, seed) => {
      const blocks: FocusPlan["blocks"] = [];
      for (const [index, block] of args.blocks.entries()) {
        const task = await deps.store.getTask(block.taskId);
        if (!task) continue;
        blocks.push({
          taskId: task.id,
          title: task.title,
          minutes: block.minutes,
          note: block.note ?? null,
        });
        await updateTask(
          deps,
          task.id,
          { estimateMinutes: block.minutes, order: index - LIMITS.planBlocks },
          { hype: false },
        );
      }
      const plan: FocusPlan = { id: `plan_${seed}`, blocks, createdAt: deps.now() };
      await deps.store.setPlan(plan);
      deps.publish({ type: "plan.updated", plan });
      return `Saved a plan of ${blocks.length} blocks.`;
    },
  }),

  set_timer: action({
    description:
      "Propose creating a care timer (omit timerId; label and intervalMinutes required) or changing one (timerId from list_timers), including enabling or disabling it.",
    parameters: obj({
      timerId: opt(str({ minLength: 1, maxLength: 64 })),
      label: opt(str({ minLength: 1, maxLength: LIMITS.timerLabel })),
      purpose: opt(str({ maxLength: LIMITS.timerPurpose })),
      instructions: opt(str({ maxLength: LIMITS.timerInstructions })),
      intervalMinutes: opt(int({ minimum: 1, maximum: 24 * 60 })),
      enabled: opt(bool()),
    }),
    problem: async (args, deps) => {
      if (
        args.intervalMinutes !== undefined &&
        args.intervalMinutes * 60 < deps.config.minTimerIntervalSeconds
      ) {
        return `Timers fire at most every ${deps.config.minTimerIntervalSeconds} seconds.`;
      }
      if (args.timerId !== undefined) {
        if (!(await deps.store.getTimer(args.timerId)))
          return `No timer with id ${args.timerId}. Call list_timers.`;
        const { timerId: _, ...changes } = args;
        return Object.values(changes).some((v) => v !== undefined)
          ? undefined
          : "Nothing to change.";
      }
      if (args.label === undefined || args.intervalMinutes === undefined) {
        return "A new timer needs a label and intervalMinutes.";
      }
      return (await deps.store.listTimers()).length >= LIMITS.timersTotal
        ? `A workspace holds at most ${LIMITS.timersTotal} timers.`
        : undefined;
    },
    describe: async (args, deps) => {
      const changes = [
        args.label !== undefined ? `label ${quote(args.label)}` : undefined,
        args.intervalMinutes !== undefined ? `every ${args.intervalMinutes} min` : undefined,
        args.purpose !== undefined ? `purpose ${quote(args.purpose)}` : undefined,
        args.instructions !== undefined ? "new nudge instructions" : undefined,
        args.enabled !== undefined ? (args.enabled ? "enabled" : "disabled") : undefined,
      ].filter(Boolean);
      if (args.timerId === undefined) return `Create care timer: ${changes.join(", ")}`;
      const timer = await deps.store.getTimer(args.timerId);
      return `Change timer ${quote(timer?.label ?? args.timerId)}: ${changes.join(", ")}`;
    },
    apply: async (args, deps, seed) => {
      const { timerId, intervalMinutes, ...fields } = args;
      const intervalSeconds = intervalMinutes === undefined ? undefined : intervalMinutes * 60;
      if (timerId !== undefined) {
        const timer = await updateTimer(deps, timerId, {
          ...fields,
          ...(intervalSeconds === undefined ? {} : { intervalSeconds }),
        });
        return `Updated timer ${timer.id}.`;
      }
      const timer = await createTimer(
        deps,
        { ...fields, label: fields.label ?? "Timer", intervalSeconds: intervalSeconds ?? 30 * 60 },
        `timer_${seed}`,
      );
      return `Created timer ${timer.id}.`;
    },
  }),
} satisfies Record<MutatingTool, Action<object>>;

export function isMutatingTool(name: string): name is MutatingTool {
  return Object.hasOwn(ACTIONS, name);
}
