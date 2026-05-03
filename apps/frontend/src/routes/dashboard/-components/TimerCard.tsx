import type { model } from "@vitask/backend-api";
import { Lock, Pencil, Sparkle, Trash2 } from "lucide-react";

import { useParticleBurst } from "#/hooks/useParticleBurst";
import { useTypewriter } from "#/hooks/useTypewriter";
import {
  getTimerIconOption,
  normalizeTimerAppearance,
  type TimerAppearance,
} from "#/lib/timerAppearance";
import { durationSeconds, type Runtime } from "#/lib/timerRuntime";
import { fmtTime } from "#/lib/timerUtils";

type TimerResponse = model.TimerResponse;

type TimerCardProps = {
  timer: TimerResponse;
  runtime: Runtime | undefined;
  remaining: number;
  alarmActive: boolean;
  appearance: TimerAppearance;
  onFireDone: (id: string) => void;
  onSnooze: (id: string, seconds: number) => void;
  onEdit: (timer: TimerResponse) => void;
  onDelete: (id: string) => void;
};

export function TimerCard({
  timer,
  runtime,
  remaining,
  alarmActive,
  appearance,
  onFireDone,
  onSnooze,
  onEdit,
  onDelete,
}: TimerCardProps) {
  const isFiring = !!runtime?.firing;
  const sweeping = !!runtime?.sweeping;
  const timerDurationSeconds = durationSeconds(timer);
  const pct = Math.round(((timerDurationSeconds - remaining) / timerDurationSeconds) * 100);
  const warning = !isFiring && remaining <= 60 && remaining > 0;
  const { particles, burst } = useParticleBurst({
    count: 10,
    baseDistance: 22,
    jitterDistance: 14,
    angleJitter: 0.4,
    durationMs: 900,
  });
  const resolvedAppearance = normalizeTimerAppearance(appearance);
  const iconOption = getTimerIconOption(resolvedAppearance.icon);
  const Icon = iconOption.Icon;

  const streamed = runtime?.message ?? "";
  const { text: typedText, done: typingDone } = useTypewriter(streamed, 8, isFiring);

  function handleDone() {
    burst();
    onFireDone(timer.id);
  }

  const snoozeSeconds = remaining >= 5 * 60 ? remaining + 5 * 60 : timerDurationSeconds;

  return (
    <article
      className={
        alarmActive
          ? "group bg-vitask-surface border-vitask-coral vitask-alarm-ring relative rounded-md border px-4 py-3 shadow-[0_0_18px_rgba(230,95,84,0.22)]"
          : isFiring
            ? "group bg-vitask-surface border-vitask-amber animate-vitask-pulse-border relative rounded-md border px-4 py-3 shadow-[0_0_12px_rgba(252,196,69,0.18)]"
            : "group bg-vitask-surface border-vitask-border hover:border-vitask-border-bright relative rounded-md border px-4 py-3 transition-colors"
      }
    >
      <div className="mb-1.5 flex min-w-0 items-center gap-2.5">
        <span className="shrink-0 leading-none" style={{ color: resolvedAppearance.color }}>
          <Icon aria-hidden="true" size={16} />
        </span>
        <span className="text-vitask-text-primary inline-flex min-w-0 flex-1 items-center gap-1.5 truncate text-[13px] font-medium">
          {timer.title}
          {timer.isDefault ? (
            <span
              className="text-vitask-text-tertiary text-[10px] opacity-70"
              title="built-in timer"
            >
              <Lock aria-hidden="true" className="text-vitask-text-tertiary" size={10} />
            </span>
          ) : null}
        </span>
        {!timer.isDefault ? (
          <>
            <button
              aria-label="Edit timer"
              className="text-vitask-text-secondary hover:text-vitask-accent hover:bg-vitask-accent/10 hover:border-vitask-accent/30 hidden h-7 w-7 items-center justify-center rounded border border-transparent transition group-hover:inline-flex"
              onClick={() => onEdit(timer)}
              type="button"
            >
              <Pencil aria-hidden="true" size={14} />
            </button>
            <button
              aria-label="Delete timer"
              className="text-vitask-text-secondary hover:text-vitask-coral hover:bg-vitask-coral/10 hover:border-vitask-coral/30 hidden h-7 w-7 items-center justify-center rounded border border-transparent transition group-hover:inline-flex"
              onClick={() => onDelete(timer.id)}
              type="button"
            >
              <Trash2 aria-hidden="true" size={14} />
            </button>
          </>
        ) : null}
        <span
          className={
            alarmActive
              ? "font-vitask-mono text-vitask-coral text-lg font-semibold tracking-[-0.01em] tabular-nums"
              : isFiring
                ? "font-vitask-mono text-vitask-amber text-lg font-semibold tracking-[-0.01em] tabular-nums"
                : warning
                  ? "font-vitask-mono text-vitask-amber text-lg font-semibold tracking-[-0.01em] tabular-nums"
                  : "font-vitask-mono text-vitask-text-secondary text-lg font-semibold tracking-[-0.01em] tabular-nums"
          }
        >
          {isFiring ? "!! 00:00" : fmtTime(remaining)}
        </span>
      </div>

      {isFiring ? (
        <>
          <div className="bg-vitask-border my-2.5 h-px" />

          <div className="mb-2 flex items-center justify-between gap-2">
            <span
              className={
                alarmActive
                  ? "text-vitask-coral border-vitask-coral/40 bg-vitask-coral/10 inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase"
                  : "text-vitask-text-tertiary border-vitask-border inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase"
              }
            >
              {alarmActive ? "alarm active" : "timer fired"}
            </span>
            <span className="text-vitask-text-tertiary text-[11px]">waiting for your response</span>
          </div>

          <div className="text-vitask-teal flex items-start gap-2 py-0.5 text-[13px] leading-relaxed italic">
            <span className="font-vitask-mono border-vitask-teal/40 bg-vitask-teal/15 text-vitask-teal mt-px inline-flex shrink-0 items-center gap-[3px] rounded-[3px] border px-[5px] py-[1px] text-[11px] leading-tight tracking-[0.06em] not-italic">
              <Sparkle aria-hidden="true" size={10} strokeWidth={2.25} />
              AI
            </span>
            <span className="min-w-0 flex-1">
              {typedText}
              {!typingDone ? (
                <span aria-hidden="true" className="animate-vitask-blink ml-0.5 inline-block">
                  ▍
                </span>
              ) : null}
            </span>
          </div>

          <div className="relative mt-2.5 flex gap-2">
            <button
              className="border-vitask-green/45 text-vitask-green hover:border-vitask-green hover:bg-vitask-green/10 flex-1 rounded border bg-transparent px-3 py-1.5 text-xs font-medium transition"
              onClick={handleDone}
              type="button"
            >
              ✓ Done
            </button>
            <button
              className="bg-vitask-elevated border-vitask-border text-vitask-text-primary hover:border-vitask-border-bright flex-1 rounded border px-3 py-1.5 text-xs font-medium transition"
              onClick={() => onSnooze(timer.id, snoozeSeconds)}
              type="button"
            >
              Snooze
            </button>
            {particles.length > 0 ? (
              <div className="pointer-events-none absolute top-1/2 left-1/2 z-10 h-0 w-0">
                {particles.map((p) => (
                  <span
                    key={p.id}
                    className="vitask-timer-particle bg-vitask-green pointer-events-none absolute top-0 left-0 block size-[5px] rounded-full"
                    style={
                      {
                        boxShadow:
                          "0 0 8px color-mix(in srgb, var(--color-vitask-green) 60%, transparent)",
                        "--dx": `${p.dx}px`,
                        "--dy": `${p.dy}px`,
                      } as React.CSSProperties
                    }
                  />
                ))}
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <p className="text-vitask-text-secondary mb-2.5 truncate text-xs">{timer.description}</p>
          <div className="bg-vitask-border relative h-1 overflow-hidden rounded-sm">
            <div
              className={
                sweeping
                  ? "vitask-progress-sweep h-full rounded-sm"
                  : "h-full rounded-sm transition-[width] duration-500 ease-linear"
              }
              style={{ width: `${pct}%`, backgroundColor: resolvedAppearance.color }}
            />
            <span className="font-vitask-mono text-vitask-text-tertiary absolute -top-4 right-0 text-[10px]">
              {pct}%
            </span>
          </div>
        </>
      )}
    </article>
  );
}
