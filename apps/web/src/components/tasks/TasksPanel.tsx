import { useMemo } from "react";

import { useNow } from "../../hooks/useNow.ts";
import { useActions, useAppState } from "../../state/client.tsx";
import type { State } from "../../state/types.ts";
import { isPendingOp, taskTree, viewTasks } from "../../state/view.ts";
import { SectionLabel } from "../ui.tsx";
import { AddTaskInput } from "./AddTaskInput.tsx";
import { TaskItem } from "./TaskItem.tsx";

const selectOps = (state: State) => state.ops;
const selectServer = (state: State) => state.server;

export function TasksPanel() {
  const actions = useActions();
  const ops = useAppState(selectOps);
  const server = useAppState(selectServer);
  const now = useNow(30_000);
  const state = useMemo(() => ({ ops, server }), [ops, server]);
  const { open, done } = useMemo(() => taskTree(viewTasks(state)), [state]);
  const hypes = server?.hypes ?? [];
  const pending = (id: string) => isPendingOp(state, id);

  return (
    <section aria-labelledby="tasks-heading" className="flex min-w-0 flex-col gap-3">
      <div className="mb-1 flex items-center justify-between">
        <SectionLabel id="tasks-heading">in flight</SectionLabel>
        {open.length > 0 ? (
          <span className="font-vitask-mono text-vitask-text-tertiary text-[11px]">
            {open.length} open
          </span>
        ) : null}
      </div>

      <AddTaskInput
        autoFocus
        label="Add task"
        onAdd={(title) => actions.addTask({ title })}
        placeholder="What are you working on..."
      />

      <ul className="flex flex-col gap-0.5">
        {open.length === 0 && done.length === 0 ? (
          <li className="font-vitask-mono text-vitask-text-tertiary px-3 py-8 text-center text-[13px]">
            // no tasks. type something above, or ask the coach.
          </li>
        ) : null}
        {open.map(({ task, steps }) => (
          <TaskItem
            hype={undefined}
            key={task.id}
            now={now}
            pending={pending}
            steps={steps}
            task={task}
          />
        ))}
        {done.length > 0 ? (
          <li aria-hidden="true">
            <div className="mt-4 mb-1.5 flex items-center gap-3 px-3">
              <div className="bg-vitask-border h-px flex-1" />
              <span className="text-vitask-text-tertiary text-[10px] tracking-[0.12em] uppercase">
                completed
              </span>
              <div className="bg-vitask-border h-px flex-1" />
            </div>
          </li>
        ) : null}
        {done.map(({ task, steps }) => (
          <TaskItem
            hype={hypes.find((hype) => hype.taskId === task.id)}
            key={task.id}
            now={now}
            pending={pending}
            steps={steps}
            task={task}
          />
        ))}
      </ul>
    </section>
  );
}
