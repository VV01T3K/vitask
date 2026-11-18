import type { Approval, CareTimer, Task } from "@vitask/protocol";

import type { State } from "./types.ts";

/** The parts of the state the views read. */
export type ViewSource = Pick<State, "server" | "ops">;

/** Tasks as the user should see them: the server's, with unconfirmed actions applied in order. */
export function viewTasks(state: ViewSource): Task[] {
  let tasks = state.server?.tasks ?? [];
  for (const op of state.ops) {
    switch (op.kind) {
      case "task.create":
        // The live update can land before the HTTP answer; the server's copy is the same task.
        if (!tasks.some((task) => task.id === op.task.id)) tasks = [...tasks, op.task];
        break;
      case "task.patch":
        tasks = tasks.map((task) => (task.id === op.taskId ? { ...task, ...op.patch } : task));
        break;
      case "task.delete":
        tasks = tasks.filter((task) => task.id !== op.taskId && task.parentId !== op.taskId);
        break;
    }
  }
  return tasks;
}

export function viewTimers(state: ViewSource): CareTimer[] {
  let timers = state.server?.timers ?? [];
  for (const op of state.ops) {
    if (op.kind === "timer.patch")
      timers = timers.map((timer) => (timer.id === op.timerId ? { ...timer, ...op.patch } : timer));
    else if (op.kind === "timer.delete") timers = timers.filter((timer) => timer.id !== op.timerId);
  }
  return timers;
}

export function isPendingOp(state: ViewSource, id: string): boolean {
  return state.ops.some(
    (op) =>
      (op.kind === "task.create" && op.task.id === id) ||
      ("taskId" in op && op.taskId === id) ||
      ("timerId" in op && op.timerId === id),
  );
}

export function pendingApprovals(state: State): Approval[] {
  return (state.server?.approvals ?? []).filter((approval) => approval.status === "pending");
}

export type TaskTree = { task: Task; steps: Task[] };

const byOrder = (a: Task, b: Task) => a.order - b.order || a.createdAt - b.createdAt;

/** Top-level tasks with their steps; open ones by order, done ones newest first. */
export function taskTree(tasks: Task[]): { open: TaskTree[]; done: TaskTree[] } {
  const steps = new Map<string, Task[]>();
  for (const task of tasks) {
    if (task.parentId === null) continue;
    steps.set(task.parentId, [...(steps.get(task.parentId) ?? []), task]);
  }
  const roots = tasks.filter((task) => task.parentId === null);
  const tree = (task: Task): TaskTree => ({
    task,
    steps: (steps.get(task.id) ?? []).sort(byOrder),
  });
  return {
    open: roots
      .filter((task) => task.status === "open")
      .sort(byOrder)
      .map(tree),
    done: roots
      .filter((task) => task.status === "done")
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
      .map(tree),
  };
}
