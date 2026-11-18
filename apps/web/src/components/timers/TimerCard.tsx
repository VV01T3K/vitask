import type { CareTimer, Nudge } from "@vitask/protocol";
import { Lock, Pause, Pencil, Play, Trash2 } from "lucide-react";

import { useParticleBurst } from "../../hooks/useParticleBurst.ts";
import { useTypewriter } from "../../hooks/useTypewriter.ts";
import { fmtInterval, fmtTime } from "../../lib/format.ts";
import { getTimerIconOption } from "../../lib/timerAppearance.ts";
import { AiBadge, cx } from "../ui.tsx";

type TimerCardProps = {
  timer: CareTimer;
  /** The nudge waiting for the user, if the timer fired while the page was open. */
  nudge: Nudge | undefined;
  sessionActive: boolean;
  /** Server-clock now. */
  now: number;
  alarm: boolean;
  onDone: () => void;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
};

const actionClass =
  "text-vitask-text-secondary inline-flex size-7 items-center justify-center rounded border border-transparent opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 focus:opacity-100 max-sm:opacity-100";

export function TimerCard({
  timer,
  nudge,
  sessionActive,
  now,
  alarm,
  onDone,
  onToggle,
  onEdit,
  onDelete,
}: TimerCardProps) {
  const firing = nudge !== undefined;
  const running = sessionActive && timer.enabled && timer.nextFireAt !== null;
  const remaining = running
    ? Math.max(0, Math.ceil((timer.nextFireAt! - now) / 1000))
    : timer.intervalSeconds;
  const pct = running
    ? Math.round(((timer.intervalSeconds - remaining) / timer.intervalSeconds) * 100)
    : 0;
  const warning = running && !firing && remaining <= 60;
  const Icon = getTimerIconOption(timer.icon).Icon;
  const { text: typed, done: typingDone } = useTypewriter(nudge?.message ?? "", 8, firing);
  const { particles, burst } = useParticleBurst({
    count: 10,
    baseDistance: 22,
    jitterDistance: 14,
    angleJitter: 0.4,
    durationMs: 900,
  });

  return (
    <article
      aria-label={`${timer.label} timer`}
      className={cx(
        "group bg-vitask-surface relative rounded-md border px-4 py-3",
        alarm
          ? "border-vitask-coral vitask-alarm-ring shadow-[0_0_18px_rgba(230,95,84,0.22)]"
          : firing
            ? "border-vitask-amber animate-vitask-pulse-border shadow-[0_0_12px_rgba(252,196,69,0.18)]"
            : "border-vitask-border hover:border-vitask-border-bright transition-colors",
        !timer.enabled && "opacity-60",
      )}
    >
      <div className="mb-1.5 flex min-w-0 items-center gap-2">
        <span className="shrink-0 leading-none" style={{ color: timer.color }}>
          <Icon aria-hidden="true" size={16} />
        </span>
        <h3 className="text-vitask-text-primary inline-flex min-w-0 flex-1 items-center gap-1.5 truncate text-[13px] font-medium">
          <span className="truncate">{timer.label}</span>
          {timer.isDefault ? (
            <Lock
              aria-label="built-in timer"
              className="text-vitask-text-tertiary shrink-0 opacity-70"
              size={10}
            />
          ) : null}
        </h3>
        <button
          aria-label={timer.enabled ? `Pause ${timer.label}` : `Resume ${timer.label}`}
          className={cx(
            actionClass,
            "hover:text-vitask-accent hover:bg-vitask-accent/10 hover:border-vitask-accent/30",
            !timer.enabled && "opacity-100",
          )}
          onClick={() => onToggle(!timer.enabled)}
          title={timer.enabled ? "Pause timer" : "Resume timer"}
          type="button"
        >
          {timer.enabled ? (
            <Pause aria-hidden="true" size={14} />
          ) : (
            <Play aria-hidden="true" size={14} />
          )}
        </button>
        <button
          aria-label={`Edit ${timer.label}`}
          className={cx(
            actionClass,
            "hover:text-vitask-accent hover:bg-vitask-accent/10 hover:border-vitask-accent/30",
          )}
          onClick={onEdit}
          type="button"
        >
          <Pencil aria-hidden="true" size={14} />
        </button>
        {!timer.isDefault ? (
          <button
            aria-label={`Delete ${timer.label}`}
            className={cx(
              actionClass,
              "hover:text-vitask-coral hover:bg-vitask-coral/10 hover:border-vitask-coral/30",
            )}
            onClick={onDelete}
            type="button"
          >
            <Trash2 aria-hidden="true" size={14} />
          </button>
        ) : null}
        <span
          aria-label={running ? `${fmtTime(remaining)} until the next nudge` : "not running"}
          className={cx(
            "font-vitask-mono ml-1 text-lg font-semibold tracking-[-0.01em] tabular-nums",
            alarm
              ? "text-vitask-coral"
              : firing || warning
                ? "text-vitask-amber"
                : running
                  ? "text-vitask-text-secondary"
                  : "text-vitask-text-tertiary",
          )}
          role="timer"
        >
          {firing ? "!! 00:00" : fmtTime(remaining)}
        </span>
      </div>

      {firing ? (
        <>
          <div className="bg-vitask-border my-2.5 h-px" />
          <div className="mb-2 flex items-center justify-between gap-2">
            <span
              className={cx(
                "inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase",
                alarm
                  ? "text-vitask-coral border-vitask-coral/40 bg-vitask-coral/10"
                  : "text-vitask-text-tertiary border-vitask-border",
              )}
            >
              {alarm ? "alarm active" : "timer fired"}
            </span>
            <span className="text-vitask-text-tertiary text-[11px]">waiting for your response</span>
          </div>
          <p
            aria-live="polite"
            className="text-vitask-teal flex items-start gap-2 py-0.5 text-[13px] leading-relaxed italic"
          >
            {nudge.source === "ai" ? <AiBadge className="mt-px" /> : null}
            <span className="min-w-0 flex-1">
              <span className="sr-only">{nudge.message}</span>
              <span aria-hidden="true">
                {typed}
                {!typingDone ? (
                  <span className="animate-vitask-blink ml-0.5 inline-block">▍</span>
                ) : null}
              </span>
            </span>
          </p>
          <div className="relative mt-2.5 flex gap-2">
            <button
              className="border-vitask-green/45 text-vitask-green hover:border-vitask-green hover:bg-vitask-green/10 flex-1 rounded border bg-transparent px-3 py-1.5 text-xs font-medium transition"
              onClick={() => {
                burst();
                window.setTimeout(onDone, 250);
              }}
              type="button"
            >
              ✓ Done
            </button>
            <button
              className="bg-vitask-elevated border-vitask-border text-vitask-text-primary hover:border-vitask-border-bright flex-1 rounded border px-3 py-1.5 text-xs font-medium transition"
              onClick={() => {
                onToggle(false);
                onDone();
              }}
              type="button"
            >
              Pause timer
            </button>
            {particles.length > 0 ? (
              <div className="pointer-events-none absolute top-1/2 left-1/2 z-10 h-0 w-0">
                {particles.map((p) => (
                  <span
                    className="vitask-timer-particle bg-vitask-green pointer-events-none absolute top-0 left-0 block size-[5px] rounded-full"
                    key={p.id}
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
          <p className="text-vitask-text-secondary mb-2.5 truncate text-xs">
            {timer.purpose ? `${timer.purpose} · ` : null}
            <span className="text-vitask-text-tertiary">
              {!timer.enabled
                ? "paused"
                : sessionActive
                  ? fmtInterval(timer.intervalSeconds)
                  : `${fmtInterval(timer.intervalSeconds)} · starts with a session`}
            </span>
          </p>
          <div className="bg-vitask-border relative h-1 overflow-hidden rounded-sm">
            <div
              className="h-full rounded-sm transition-[width] duration-500 ease-linear"
              style={{ width: `${pct}%`, backgroundColor: timer.color }}
            />
          </div>
        </>
      )}
    </article>
  );
}
