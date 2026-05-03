import { Sparkle } from "lucide-react";

import { useTypewriter } from "#/hooks/useTypewriter";

type WrapUpStats = {
  tasks: number;
  fired: number;
  snoozed: number;
  minutes: number;
};

type WrapUpModalProps = {
  open: boolean;
  onClose: () => void;
  stats: WrapUpStats;
  debriefText: string;
};

export function WrapUpModal({ open, onClose, stats, debriefText }: WrapUpModalProps) {
  const isLoading = !debriefText || debriefText === "...";
  const { text, done } = useTypewriter(isLoading ? "" : debriefText);

  if (!open) return null;

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const durStr = `${Math.floor(stats.minutes / 60)}h ${stats.minutes % 60}m`;

  return (
    <div
      className="vitask-modal-backdrop fixed inset-0 z-[100] flex items-end justify-center bg-[var(--vitask-backdrop)]"
      onClick={onClose}
    >
      <div
        className="vitask-wrap-modal-in bg-vitask-surface border-vitask-border-bright w-full max-w-[720px] rounded-t-xl border-t shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-vitask-border border-b px-6 pt-[18px] pb-3">
          <div className="font-vitask-mono text-vitask-text-primary text-sm font-medium tracking-[-0.01em]">
            Session Debrief{" "}
            <span className="text-vitask-text-tertiary font-normal">
              · {dateStr} · {durStr}
            </span>
          </div>
        </div>

        <div className="min-h-[140px] px-6 py-6">
          <div className="text-vitask-teal flex items-start gap-2.5 text-[15px] leading-[1.6] italic">
            <span className="font-vitask-mono border-vitask-teal/40 bg-vitask-teal/15 text-vitask-teal mt-1 inline-flex shrink-0 items-center gap-1 rounded-[3px] border px-[7px] py-0.5 text-[11px] leading-tight tracking-[0.06em] not-italic">
              <Sparkle aria-hidden="true" size={10} strokeWidth={2.25} />
              AI
            </span>
            <span className="flex-1">
              {isLoading ? null : text}
              {isLoading || !done ? (
                <span aria-hidden="true" className="animate-vitask-blink inline-block">
                  ▍
                </span>
              ) : null}
            </span>
          </div>
        </div>

        <div className="border-vitask-border font-vitask-mono text-vitask-text-tertiary flex gap-4 border-t px-6 py-3.5 text-xs">
          <span className="text-vitask-text-secondary">{stats.tasks} tasks</span>
          <span>·</span>
          <span className="text-vitask-text-secondary">{stats.fired} timers fired</span>
          <span>·</span>
          <span className="text-vitask-text-secondary">{stats.snoozed} snoozed</span>
        </div>

        <div className="border-vitask-border flex justify-end border-t px-5 py-3.5">
          <button
            className="border-vitask-border text-vitask-text-secondary hover:border-vitask-border-bright hover:text-vitask-text-primary rounded border bg-transparent px-4 py-2 text-[13px] transition"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
