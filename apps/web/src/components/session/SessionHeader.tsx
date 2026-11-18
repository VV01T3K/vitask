import { Loader2, Play, Sparkle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useNow } from "../../hooks/useNow.ts";
import { describeError } from "../../lib/errors.ts";
import { clockTime } from "../../lib/format.ts";
import { useActions, useAppState } from "../../state/client.tsx";
import type { State, UiError } from "../../state/types.ts";
import { viewTasks } from "../../state/view.ts";
import { buttonClass } from "../ui.tsx";
import { WrapUpModal, type WrapUpStats } from "./WrapUpModal.tsx";

const selectServer = (state: State) => state.server;
const selectOps = (state: State) => state.ops;

export function SessionHeader() {
  const actions = useActions();
  const server = useAppState(selectServer);
  const ops = useAppState(selectOps);
  const now = useNow(15_000);
  const [starting, setStarting] = useState(false);
  const [wrapUp, setWrapUp] = useState<{ stats: WrapUpStats; error: UiError | null } | null>(null);

  const session = server?.session ?? null;
  const active = session?.status === "active";
  const tasks = viewTasks({ server, ops });
  const open = tasks.filter((task) => task.status === "open" && task.parentId === null).length;
  const doneThisSession = session
    ? tasks.filter((task) => task.completedAt !== null && task.completedAt >= session.startedAt)
        .length
    : 0;
  const minutes = session
    ? Math.max(0, Math.floor(((session.endedAt ?? now) - session.startedAt) / 60_000))
    : 0;

  async function start() {
    setStarting(true);
    const error = await actions.startSession();
    setStarting(false);
    if (error) toast.error(describeError(error));
  }

  async function end() {
    setWrapUp({
      stats: { tasks: doneThisSession, nudges: server?.nudges.length ?? 0, minutes },
      error: null,
    });
    const error = await actions.endSession();
    if (error) setWrapUp((current) => current && { ...current, error });
  }

  return (
    <section
      aria-label="Session"
      className="border-vitask-border bg-vitask-surface flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-vitask-mono text-vitask-text-tertiary flex items-center gap-3 text-[11px] tracking-[0.12em] uppercase">
          <span aria-hidden="true" className="relative flex size-2">
            {active ? (
              <span className="bg-vitask-accent absolute inline-flex size-full animate-ping rounded-full opacity-75" />
            ) : null}
            <span
              className={
                active
                  ? "bg-vitask-accent relative inline-flex size-2 rounded-full"
                  : "bg-vitask-text-tertiary relative inline-flex size-2 rounded-full"
              }
            />
          </span>
          {active
            ? "live session"
            : session?.status === "wrapping_up"
              ? "wrapping up"
              : "no session"}
        </span>
        <span className="text-vitask-text-secondary text-sm">{open} open</span>
        {active ? (
          <>
            <span className="text-vitask-text-secondary text-sm">{doneThisSession} done</span>
            <span className="text-vitask-text-secondary text-sm">{minutes} min</span>
            <span className="text-vitask-text-tertiary hidden text-xs sm:inline">
              timers stop at {clockTime(session.maxEndsAt)}
            </span>
          </>
        ) : (
          <span className="text-vitask-text-tertiary text-xs">
            care timers run during a session
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {session?.status === "ended" && session.debrief ? (
          <button
            className="text-vitask-text-tertiary hover:text-vitask-text-primary text-xs underline-offset-2 hover:underline"
            onClick={() =>
              setWrapUp({
                stats: { tasks: doneThisSession, nudges: server?.nudges.length ?? 0, minutes },
                error: null,
              })
            }
            type="button"
          >
            last debrief
          </button>
        ) : null}
        {active ? (
          <button className={buttonClass.secondary} onClick={() => void end()} type="button">
            Wrap up session <Sparkle aria-hidden="true" className="text-vitask-teal" size={12} />
          </button>
        ) : session?.status === "wrapping_up" ? (
          <span className="text-vitask-text-secondary inline-flex items-center gap-2 text-[13px]">
            <Loader2 aria-hidden="true" className="animate-spin" size={14} /> writing debrief
          </span>
        ) : (
          <button
            className={buttonClass.primary}
            disabled={starting}
            onClick={() => void start()}
            type="button"
          >
            {starting ? (
              <Loader2 aria-hidden="true" className="animate-spin" size={14} />
            ) : (
              <Play aria-hidden="true" size={13} />
            )}
            Start session
          </button>
        )}
      </div>
      {wrapUp ? (
        <WrapUpModal
          error={wrapUp.error}
          onClose={() => setWrapUp(null)}
          session={session}
          stats={wrapUp.stats}
        />
      ) : null}
    </section>
  );
}
