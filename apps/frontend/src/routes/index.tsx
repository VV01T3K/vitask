import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { TaskItem } from "../components/vitask/TaskItem";
import { TimerCard } from "../components/vitask/TimerCard";
import {
  activeTasks,
  firingTimers,
  runningTimers,
  completedTasks,
} from "../components/vitask/vitask.data";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="vitask-surface font-vitask-body text-vitask-text-primary min-h-screen">
      <main className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-4 p-6 lg:grid-cols-[3fr_2fr]">
        <TasksPanel />
        <TimersPanel />
      </main>
    </div>
  );
}

function TasksPanel() {
  return (
    <section className="flex min-h-0 flex-col gap-3">
      <div className="text-vitask-text-tertiary mb-1 flex items-center justify-between text-[11px] font-medium tracking-[0.08em] uppercase">
        <span>in flight</span>
      </div>

      <div className="bg-vitask-elevated border-vitask-border focus-within:border-vitask-accent flex h-11 items-center gap-2.5 rounded-md border px-3.5 transition-colors">
        <span className="font-vitask-mono text-vitask-text-tertiary text-base select-none">+</span>
        <input
          className="placeholder:text-vitask-text-tertiary text-vitask-text-primary flex-1 border-none bg-transparent text-sm outline-none"
          placeholder="What are you working on..."
          type="text"
        />
      </div>

      <ul className="flex flex-col gap-0.5">
        {activeTasks.map((task) => (
          <TaskItem key={task.id} task={task} />
        ))}

        <li>
          <div className="mt-4 mb-1.5 flex items-center gap-3 px-3">
            <div className="bg-vitask-border h-px flex-1" />
            <span className="text-vitask-text-tertiary text-[10px] tracking-[0.12em] uppercase">
              completed
            </span>
            <div className="bg-vitask-border h-px flex-1" />
          </div>
        </li>

        {completedTasks.map((task) => (
          <TaskItem key={task.id} task={task} />
        ))}
      </ul>
    </section>
  );
}

function TimersPanel() {
  return (
    <section className="flex min-h-0 flex-col gap-3">
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="text-vitask-text-tertiary text-[11px] font-medium tracking-[0.08em] uppercase">
          timers
        </span>
        <button
          className="border-vitask-border text-vitask-text-tertiary cursor-default rounded-full border bg-transparent px-2.5 py-[3px] text-[11px] tracking-[0.04em]"
          type="button"
        >
          auto-snooze: off
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {runningTimers.map((timer) => (
          <TimerCard key={timer.id} timer={timer} />
        ))}
        {firingTimers.map((timer) => (
          <TimerCard key={timer.id} timer={timer} />
        ))}
        <button
          className="border-vitask-border text-vitask-text-tertiary hover:border-vitask-border-bright hover:text-vitask-accent hover:bg-vitask-accent/5 flex cursor-default flex-col items-center justify-center gap-1.5 rounded-md border border-dashed bg-transparent px-3 py-6 transition hover:border-solid"
          type="button"
        >
          <Plus aria-hidden="true" className="font-vitask-mono" size={22} strokeWidth={1.5} />
          <span className="text-[11px] tracking-[0.08em] uppercase">add timer</span>
        </button>
      </div>
    </section>
  );
}
