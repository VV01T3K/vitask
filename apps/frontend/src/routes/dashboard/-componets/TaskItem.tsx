import type { model } from "@vitask/backend-api";
import { RotateCcw, Sparkles, X } from "lucide-react";
import { useState } from "react";

import { relTime } from "#/lib/timerUtils";

type TaskResponse = model.TaskResponse;

type TaskItemProps = {
  task: TaskResponse;
  hype?: string | null;
  isEntering?: boolean;
  onComplete: (id: string) => void;
  onUncomplete: (id: string) => void;
  onDelete: (id: string) => void;
};

type Particle = {
  id: number;
  dx: number;
  dy: number;
};

export function TaskItem({
  task,
  hype,
  isEntering,
  onComplete,
  onUncomplete,
  onDelete,
}: TaskItemProps) {
  const [completing, setCompleting] = useState(false);
  const [striking, setStriking] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [showHype, setShowHype] = useState(false);

  function fireParticles() {
    const baseId = Date.now();
    const next: Particle[] = Array.from({ length: 6 }, (_, i) => {
      const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 16 + Math.random() * 10;
      return { id: baseId + i, dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist };
    });
    setParticles(next);
    setTimeout(() => setParticles([]), 700);
  }

  function handleComplete() {
    if (completing || task.isCompleted) return;
    setCompleting(true);
    fireParticles();
    setTimeout(() => setStriking(true), 100);
    setTimeout(() => onComplete(task.id), 400);
  }

  if (task.isCompleted) {
    return (
      <li className="group relative flex h-11 items-center gap-3 rounded px-3 opacity-60 transition-opacity hover:opacity-100">
        <button
          aria-label="mark incomplete"
          className="border-vitask-green hover:border-vitask-coral relative flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] bg-transparent transition-colors [&:hover_.dot]:hidden [&:hover_.revert]:flex"
          onClick={() => onUncomplete(task.id)}
          title="Click to un-check"
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

        <span
          className="text-vitask-text-secondary flex-1 cursor-pointer truncate text-[13px] line-through"
          onClick={() => onUncomplete(task.id)}
        >
          {task.title}
        </span>

        {task.completedAt ? (
          <span className="text-vitask-text-tertiary shrink-0 text-xs">
            {relTime(new Date(task.completedAt).getTime())}
          </span>
        ) : null}

        <div className="flex items-center gap-0.5">
          {hype ? (
            <div className="relative">
              <span
                aria-label="hype quote"
                className="text-vitask-text-secondary hover:text-vitask-teal hover:bg-vitask-teal/10 hover:border-vitask-teal/30 inline-flex h-7 w-7 cursor-help items-center justify-center rounded border border-transparent opacity-55 transition hover:opacity-100"
                onMouseEnter={() => setShowHype(true)}
                onMouseLeave={() => setShowHype(false)}
              >
                <Sparkles aria-hidden="true" size={12} strokeWidth={2.25} />
              </span>
              {showHype ? (
                <span className="bg-vitask-elevated border-vitask-border-bright text-vitask-teal pointer-events-none absolute right-0 bottom-[calc(100%+6px)] z-10 w-60 rounded border p-2.5 text-xs leading-relaxed font-normal whitespace-normal italic shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
                  "{hype}"
                </span>
              ) : null}
            </div>
          ) : null}

          <button
            aria-label="delete"
            className="text-vitask-text-secondary hover:text-vitask-coral hover:bg-vitask-coral/10 hover:border-vitask-coral/30 inline-flex h-7 w-7 items-center justify-center rounded border border-transparent leading-none opacity-50 transition group-hover:opacity-100"
            onClick={() => onDelete(task.id)}
            type="button"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>
      </li>
    );
  }

  return (
    <li
      className={
        isEntering
          ? "group hover:bg-vitask-elevated animate-vitask-slide-in-top relative flex h-11 items-center gap-3 rounded px-3 transition-colors"
          : "group hover:bg-vitask-elevated relative flex h-11 items-center gap-3 rounded px-3 transition-colors"
      }
    >
      <button
        aria-label="mark complete"
        className={
          completing
            ? "border-vitask-green bg-vitask-green animate-vitask-bounce relative flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors"
            : "border-vitask-text-tertiary group-hover:border-vitask-text-secondary relative flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] bg-transparent transition-colors"
        }
        onClick={handleComplete}
        type="button"
      >
        {completing ? (
          <span className="text-vitask-bg text-[11px] leading-none font-bold">✓</span>
        ) : (
          <span className="bg-vitask-text-tertiary block size-2 rounded-full opacity-0 transition-opacity group-hover:opacity-100" />
        )}
        {particles.map((p) => (
          <span
            key={p.id}
            className="vitask-particle bg-vitask-green pointer-events-none absolute top-1/2 left-1/2 size-1 rounded-full"
            style={
              {
                "--dx": `${p.dx}px`,
                "--dy": `${p.dy}px`,
              } as React.CSSProperties
            }
          />
        ))}
      </button>

      <span
        className={
          striking
            ? "text-vitask-text-primary vitask-strike relative flex-1 cursor-pointer truncate text-sm"
            : "text-vitask-text-primary flex-1 cursor-pointer truncate text-sm"
        }
        onClick={handleComplete}
      >
        {task.title}
      </span>

      <button
        aria-label="delete"
        className="text-vitask-text-secondary hover:text-vitask-coral hover:bg-vitask-coral/10 hover:border-vitask-coral/30 group-hover:text-vitask-text-primary inline-flex h-7 w-7 items-center justify-center rounded border border-transparent text-lg leading-none opacity-55 transition group-hover:opacity-100"
        onClick={() => onDelete(task.id)}
        type="button"
      >
        <X aria-hidden="true" size={16} />
      </button>
    </li>
  );
}
