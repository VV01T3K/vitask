import { api } from "@vitask/backend-api";
import { useEffect, useState, type ReactNode } from "react";

const CLOCK_TICK_MS = 1000;

type SessionHeaderProps = {
  sessionStartedAt: number;
  children?: ReactNode;
};

export function SessionHeader({ sessionStartedAt, children }: SessionHeaderProps) {
  const { data: tasksResponse } = api.useListTasksSuspense();
  const tasks = tasksResponse.data;
  const activeCount = tasks.filter((task) => !task.isCompleted).length;
  const completedCount = tasks.length - activeCount;

  const [minutes, setMinutes] = useState(() => Math.floor((Date.now() - sessionStartedAt) / 60000));

  useEffect(() => {
    const tick = () => setMinutes(Math.floor((Date.now() - sessionStartedAt) / 60000));
    tick();
    const id = window.setInterval(tick, CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, [sessionStartedAt]);

  return (
    <section className="border-vitask-border bg-vitask-surface flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3">
      <div className="flex items-center gap-4">
        <span className="font-vitask-mono text-vitask-text-tertiary flex items-center gap-3 text-[11px] tracking-[0.12em] uppercase">
          <span className="relative flex h-2 w-2">
            <span className="bg-vitask-accent absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
            <span className="bg-vitask-accent relative inline-flex h-2 w-2 rounded-full" />
          </span>
          live session
        </span>
        <span className="text-vitask-text-secondary text-sm">{activeCount} active</span>
        <span className="text-vitask-text-secondary text-sm">{completedCount} completed</span>
        <span className="text-vitask-text-secondary text-sm">{minutes} min</span>
      </div>
      {children}
    </section>
  );
}
