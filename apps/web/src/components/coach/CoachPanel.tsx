import { Sparkle } from "lucide-react";
import { useRef, useState } from "react";

import { inDuration } from "../../lib/errors.ts";
import { useAppState } from "../../state/client.tsx";
import type { State } from "../../state/types.ts";
import { pendingApprovals } from "../../state/view.ts";
import { Composer } from "./Composer.tsx";
import { Transcript } from "./Transcript.tsx";

const selectBudget = (state: State) => state.server?.budget ?? null;
const selectModel = (state: State) => state.server?.coach.model ?? "";
const selectBusy = (state: State) => state.server?.coach.live.busy ?? false;
const selectConnected = (state: State) => state.connection.status === "open";
const selectWaiting = (state: State) => pendingApprovals(state).length;

function untilMidnightUtc(now: number): number {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next.getTime() - now;
}

export function CoachPanel() {
  const budget = useAppState(selectBudget);
  const model = useAppState(selectModel);
  const busy = useAppState(selectBusy);
  const connected = useAppState(selectConnected);
  const waiting = useAppState(selectWaiting);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const used = budget ? budget.tokensUsedToday / Math.max(1, budget.dailyTokenLimit) : 0;
  const exhausted = budget !== null && budget.tokensUsedToday >= budget.dailyTokenLimit;
  const blocked = exhausted
    ? `Today's AI budget is used up; the coach is back ${inDuration(untilMidnightUtc(Date.now()))}. Tasks and timers still work.`
    : null;

  return (
    <section
      aria-labelledby="coach-heading"
      className="border-vitask-border bg-vitask-surface flex h-full min-h-[420px] flex-col overflow-hidden rounded-md border"
    >
      <div className="border-vitask-border flex items-center gap-2 border-b px-4 py-2.5">
        <Sparkle aria-hidden="true" className="text-vitask-teal" size={13} />
        <h2
          className="text-vitask-text-tertiary text-[11px] font-medium tracking-[0.08em] uppercase"
          id="coach-heading"
        >
          coach
        </h2>
        {busy ? (
          <span className="font-vitask-mono text-vitask-accent text-[10px]">working</span>
        ) : null}
        {waiting > 0 ? (
          <span
            className="bg-vitask-amber/15 text-vitask-amber font-vitask-mono rounded-full px-1.5 py-px text-[10px]"
            role="status"
          >
            {waiting} to review
          </span>
        ) : null}
        {budget ? (
          <span
            className="ml-auto flex items-center gap-2"
            title={`${budget.tokensUsedToday.toLocaleString()} of ${budget.dailyTokenLimit.toLocaleString()} tokens today · ${model}`}
          >
            <span className="font-vitask-mono text-vitask-text-tertiary hidden text-[10px] sm:inline">
              {Math.round(used * 100)}% of today's budget
            </span>
            <span
              aria-hidden="true"
              className="bg-vitask-border h-1 w-12 overflow-hidden rounded-sm"
            >
              <span
                className={
                  exhausted
                    ? "bg-vitask-coral block h-full"
                    : used > 0.8
                      ? "bg-vitask-amber block h-full"
                      : "bg-vitask-teal block h-full"
                }
                style={{ width: `${Math.min(100, used * 100)}%` }}
              />
            </span>
          </span>
        ) : null}
      </div>
      <Transcript
        onSuggest={(suggestion) => {
          setText(suggestion);
          inputRef.current?.focus();
        }}
      />
      <Composer
        blocked={blocked}
        busy={busy}
        connected={connected}
        inputRef={inputRef}
        setText={setText}
        text={text}
      />
    </section>
  );
}
