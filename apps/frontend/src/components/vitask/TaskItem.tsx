import { RotateCcw, Sparkles, X } from "lucide-react";

import type { Task } from "./vitask.data";

type TaskItemProps = {
  task: Task;
};

export function TaskItem({ task }: TaskItemProps) {
  const isCompleted = task.status === "completed";

  return (
    <li
      className={
        isCompleted
          ? "group relative flex h-11 items-center gap-3 rounded px-3 opacity-60 transition-opacity hover:opacity-100"
          : "group hover:bg-vitask-elevated relative flex h-11 items-center gap-3 rounded px-3 transition-colors"
      }
    >
      {isCompleted ? (
        <button
          aria-label="mark incomplete"
          className="border-vitask-green hover:border-vitask-coral relative flex size-[18px] shrink-0 cursor-default items-center justify-center rounded-full border-[1.5px] bg-transparent transition-colors [&:hover_.dot]:hidden [&:hover_.revert]:flex"
          type="button"
        >
          <span className="dot bg-vitask-green ring-vitask-green/25 absolute inset-[3px] rounded-full ring-2" />
          <RotateCcw
            aria-hidden="true"
            className="revert text-vitask-coral hidden"
            size={10}
            strokeWidth={2.5}
          />
        </button>
      ) : (
        <button
          aria-label="mark complete"
          className="border-vitask-text-tertiary group-hover:border-vitask-text-secondary relative flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] bg-transparent transition-colors"
          type="button"
        >
          <span className="bg-vitask-text-tertiary block size-2 rounded-full opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      )}

      <span
        className={
          isCompleted
            ? "text-vitask-text-secondary flex-1 truncate text-[13px] line-through"
            : "text-vitask-text-primary flex-1 truncate text-sm"
        }
      >
        {task.title}
      </span>

      {isCompleted ? (
        <>
          <span className="text-vitask-text-tertiary shrink-0 text-xs">{task.completedAgo}</span>

          <span
            aria-label="hype quote"
            className="font-vitask-mono text-vitask-text-tertiary hover:text-vitask-teal relative cursor-help text-xs opacity-0 transition group-hover:opacity-100"
            title={task.hype}
          >
            <Sparkles
              aria-hidden="true"
              className="text-vitask-teal/90"
              size={11}
              strokeWidth={2.25}
            />
            <span className="bg-vitask-elevated border-vitask-border-bright text-vitask-teal pointer-events-none absolute right-0 bottom-[calc(100%+6px)] z-10 hidden w-60 rounded border p-2.5 text-xs leading-relaxed font-normal whitespace-normal italic shadow-[0_20px_60px_rgba(0,0,0,0.5)] group-hover:hover:block">
              "{task.hype}"
            </span>
          </span>
        </>
      ) : null}

      <button
        aria-label="delete"
        className={
          isCompleted
            ? "text-vitask-text-secondary hover:text-vitask-coral hover:bg-vitask-coral/10 hover:border-vitask-coral/30 inline-flex h-7 w-7 cursor-default items-center justify-center rounded border border-transparent leading-none opacity-50 transition group-hover:opacity-100"
            : "text-vitask-text-secondary hover:text-vitask-coral hover:bg-vitask-coral/10 hover:border-vitask-coral/30 group-hover:text-vitask-text-primary inline-flex h-7 w-7 cursor-default items-center justify-center rounded border border-transparent text-lg leading-none opacity-55 transition group-hover:opacity-100"
        }
        type="button"
      >
        <X aria-hidden="true" size={16} />
      </button>
    </li>
  );
}
