import type { Session } from "@vitask/protocol";
import { useId } from "react";

import { useTypewriter } from "../../hooks/useTypewriter.ts";
import { describeError } from "../../lib/errors.ts";
import type { UiError } from "../../state/types.ts";
import { AiBadge, buttonClass, Cursor, ErrorText, useDialogFocus } from "../ui.tsx";

export type WrapUpStats = { tasks: number; nudges: number; minutes: number };

export function WrapUpModal({
  session,
  stats,
  error,
  onClose,
}: {
  session: Session | null;
  stats: WrapUpStats;
  error: UiError | null;
  onClose: () => void;
}) {
  const debrief = session?.status === "ended" ? session.debrief : null;
  const { text, done } = useTypewriter(debrief ?? "");
  const dialog = useDialogFocus(onClose);
  const titleId = useId();
  const date = new Date(session?.startedAt ?? Date.now()).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div
      className="vitask-modal-backdrop fixed inset-0 z-[100] flex items-end justify-center bg-[var(--vitask-backdrop)]"
      onClick={onClose}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="vitask-wrap-modal-in bg-vitask-surface border-vitask-border-bright w-full max-w-[720px] rounded-t-xl border-t shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
        onClick={(event) => event.stopPropagation()}
        ref={dialog}
        role="dialog"
      >
        <div className="border-vitask-border border-b px-6 pt-[18px] pb-3">
          <h2
            className="font-vitask-mono text-vitask-text-primary text-sm font-medium tracking-[-0.01em]"
            id={titleId}
          >
            Session Debrief{" "}
            <span className="text-vitask-text-tertiary font-normal">
              · {date} · {Math.floor(stats.minutes / 60)}h {stats.minutes % 60}m
            </span>
          </h2>
        </div>

        <div className="min-h-[140px] px-6 py-6" aria-busy={!debrief}>
          {error ? (
            <ErrorText>{describeError(error)}</ErrorText>
          ) : (
            <div className="text-vitask-teal flex items-start gap-2.5 text-[15px] leading-[1.6] italic">
              {session?.debriefSource === "ai" || !debrief ? <AiBadge className="mt-1" /> : null}
              <p className="flex-1">
                {debrief ? (
                  <span className="sr-only">{debrief}</span>
                ) : (
                  <span className="sr-only">Writing your debrief…</span>
                )}
                <span aria-hidden="true">{text}</span>
                {!debrief || !done ? <Cursor /> : null}
              </p>
            </div>
          )}
        </div>

        <div className="border-vitask-border font-vitask-mono text-vitask-text-tertiary flex flex-wrap gap-4 border-t px-6 py-3.5 text-xs">
          <span className="text-vitask-text-secondary">{stats.tasks} tasks done</span>
          <span aria-hidden="true">·</span>
          <span className="text-vitask-text-secondary">{stats.nudges} nudges</span>
        </div>

        <div className="border-vitask-border flex justify-end border-t px-5 py-3.5">
          <button className={buttonClass.secondary} onClick={onClose} type="button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
