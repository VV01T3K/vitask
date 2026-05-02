import { Droplet, Eye, Sparkle } from "lucide-react";

import type { Timer } from "./vitask.data";

type TimerCardProps = {
  timer: Timer;
};

export function TimerCard({ timer }: TimerCardProps) {
  const isFiring = timer.status === "firing";

  return (
    <article
      className={
        isFiring
          ? "bg-vitask-surface border-vitask-amber animate-vitask-pulse-border relative rounded-md border px-4 py-3 shadow-[0_0_12px_rgba(252,196,69,0.18)]"
          : "bg-vitask-surface border-vitask-border hover:border-vitask-border-bright relative rounded-md border px-4 py-3 transition-colors"
      }
    >
      <div className="mb-1.5 flex items-center gap-2.5">
        <span className="text-vitask-text-secondary leading-none">
          {timer.icon === "droplet" ? <Droplet aria-hidden="true" size={16} /> : null}
          {timer.icon === "eye" ? <Eye aria-hidden="true" size={16} /> : null}
        </span>
        <span className="text-vitask-text-primary inline-flex flex-1 items-center gap-1.5 text-[13px] font-medium">
          {timer.title}
          {timer.isDefault ? (
            <span
              className="text-vitask-text-tertiary text-[10px] opacity-70"
              title="default — can edit, can't delete"
            >
              🔒
            </span>
          ) : null}
        </span>
        <span
          className={
            isFiring
              ? "font-vitask-mono text-vitask-amber text-lg font-semibold tracking-[-0.01em] tabular-nums"
              : "font-vitask-mono text-vitask-text-secondary text-lg font-semibold tracking-[-0.01em] tabular-nums"
          }
        >
          {isFiring ? "!! 00:00" : timer.countdown}
        </span>
      </div>

      {isFiring ? (
        <>
          <div className="bg-vitask-border my-2.5 h-px" />

          <div className="text-vitask-teal flex items-start gap-2 py-0.5 text-[13px] leading-relaxed italic">
            <span className="font-vitask-mono border-vitask-teal/40 bg-vitask-teal/15 text-vitask-teal mt-px inline-flex shrink-0 items-center gap-[3px] rounded-[3px] border px-[5px] py-[1px] text-[11px] leading-tight tracking-[0.06em] not-italic">
              <Sparkle aria-hidden="true" size={10} strokeWidth={2.25} />
              AI
            </span>
            <span className="min-w-0 flex-1">
              {timer.aiMessage}
              <span aria-hidden="true" className="animate-vitask-blink ml-0.5 inline-block">
                ▍
              </span>
            </span>
          </div>

          <div className="mt-2.5 flex gap-2">
            <button
              className="border-vitask-green/45 text-vitask-green hover:border-vitask-green hover:bg-vitask-green/10 flex-1 cursor-default rounded border bg-transparent px-3 py-1.5 text-xs font-medium transition"
              type="button"
            >
              ✓ Done
            </button>
            <button
              className="bg-vitask-elevated border-vitask-border text-vitask-text-primary hover:border-vitask-border-bright flex-1 cursor-default rounded border px-3 py-1.5 text-xs font-medium transition"
              type="button"
            >
              +5 min
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-vitask-text-secondary mb-2.5 truncate text-xs">{timer.description}</p>
          <div className="bg-vitask-border relative h-1 overflow-hidden rounded-sm">
            <div
              className="h-full rounded-sm transition-[width] duration-500 ease-linear"
              style={{ width: `${timer.progressPct}%`, backgroundColor: timer.accent }}
            />
            <span className="font-vitask-mono text-vitask-text-tertiary absolute -top-4 right-0 text-[10px]">
              {timer.progressPct}%
            </span>
          </div>
        </>
      )}
    </article>
  );
}
