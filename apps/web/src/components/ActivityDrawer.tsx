import type { TurnLogEntry } from "@vitask/protocol";
import { useEffect, useId, useState } from "react";

import { describeError } from "../lib/errors.ts";
import { clockTime } from "../lib/format.ts";
import { useActions, useAppState } from "../state/client.tsx";
import type { State, UiError } from "../state/types.ts";
import { cx, ErrorText, ModalHeader, useDialogFocus } from "./ui.tsx";

const selectTurns = (state: State) => state.turns;
const selectLoaded = (state: State) => state.turnsLoaded;
const selectBudget = (state: State) => state.server?.budget ?? null;

const OUTCOME_TONE: Record<TurnLogEntry["outcome"], string> = {
  ok: "text-vitask-green",
  error: "text-vitask-coral",
  aborted: "text-vitask-amber",
  length: "text-vitask-amber",
  budget_exhausted: "text-vitask-coral",
};

function money(usd: number | null): string {
  if (usd === null) return "—";
  return usd < 0.01 ? `$${usd.toFixed(5)}` : `$${usd.toFixed(3)}`;
}

/** Every model request the coach made: what triggered it, what it cost, what it did. */
export function ActivityDrawer({ onClose }: { onClose: () => void }) {
  const actions = useActions();
  const turns = useAppState(selectTurns);
  const loaded = useAppState(selectLoaded);
  const budget = useAppState(selectBudget);
  const [error, setError] = useState<UiError | null>(null);
  const dialog = useDialogFocus(onClose);
  const titleId = useId();

  useEffect(() => {
    void actions.loadTurns().then(setError);
  }, [actions]);

  const dayStart = new Date().setUTCHours(0, 0, 0, 0);
  const today = turns.filter((turn) => turn.at >= dayStart);
  const cost = today.reduce((sum, turn) => sum + (turn.costUsd ?? 0), 0);
  const used = budget ? budget.tokensUsedToday / Math.max(1, budget.dailyTokenLimit) : 0;

  return (
    <div
      className="vitask-modal-backdrop fixed inset-0 z-[100] flex justify-end bg-[var(--vitask-backdrop)]"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="vitask-drawer-in bg-vitask-surface border-vitask-border-bright flex h-full w-full max-w-[880px] flex-col border-l shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
        ref={dialog}
        role="dialog"
      >
        <ModalHeader id={titleId} onClose={onClose} title="Agent activity" />

        <div className="border-vitask-border grid grid-cols-2 gap-4 border-b px-5 py-4 sm:grid-cols-4">
          <Stat
            label="tokens today"
            value={budget ? budget.tokensUsedToday.toLocaleString() : "—"}
          />
          <Stat
            label="daily budget"
            value={
              budget
                ? `${Math.round(used * 100)}% of ${budget.dailyTokenLimit.toLocaleString()}`
                : "—"
            }
          />
          <Stat label="requests today" value={String(today.length)} />
          <Stat label="cost today" value={money(cost)} />
          {budget ? (
            <div
              aria-hidden="true"
              className="bg-vitask-border col-span-full h-1 overflow-hidden rounded-sm"
            >
              <div
                className={
                  used >= 1
                    ? "bg-vitask-coral h-full"
                    : used > 0.8
                      ? "bg-vitask-amber h-full"
                      : "bg-vitask-teal h-full"
                }
                style={{ width: `${Math.min(100, used * 100)}%` }}
              />
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {error ? <ErrorText>{describeError(error)}</ErrorText> : null}
          {!loaded && !error ? (
            <p className="font-vitask-mono text-vitask-text-tertiary text-[12px]">loading…</p>
          ) : null}
          {loaded && turns.length === 0 ? (
            <p className="font-vitask-mono text-vitask-text-tertiary text-[12px]">
              // no model requests yet.
            </p>
          ) : null}
          {turns.length > 0 ? (
            <table className="font-vitask-mono w-full min-w-[720px] border-collapse text-left text-[11px]">
              <caption className="sr-only">Model requests, newest first</caption>
              <thead className="text-vitask-text-tertiary">
                <tr className="border-vitask-border border-b">
                  {[
                    "time",
                    "trigger",
                    "model",
                    "tokens in/out",
                    "cost",
                    "latency",
                    "tools",
                    "outcome",
                  ].map((head) => (
                    <th
                      className="px-2 py-2 font-medium tracking-[0.06em] uppercase"
                      key={head}
                      scope="col"
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {turns.map((turn) => (
                  <tr
                    className="border-vitask-border text-vitask-text-secondary border-b align-top"
                    data-trigger={turn.trigger}
                    key={turn.id}
                  >
                    <td className="px-2 py-2 whitespace-nowrap tabular-nums">
                      {clockTime(turn.at)}
                    </td>
                    <td className="text-vitask-text-primary px-2 py-2">{turn.trigger}</td>
                    <td
                      className="max-w-40 truncate px-2 py-2"
                      title={`${turn.provider}/${turn.model}`}
                    >
                      {turn.model}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap tabular-nums">
                      {turn.inputTokens.toLocaleString()} / {turn.outputTokens.toLocaleString()}
                      {turn.cacheReadTokens > 0 ? (
                        <span className="text-vitask-text-tertiary">
                          {" "}
                          ({turn.cacheReadTokens.toLocaleString()} cached)
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 tabular-nums">{money(turn.costUsd)}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {turn.latencyMs === null ? "—" : `${(turn.latencyMs / 1000).toFixed(2)} s`}
                    </td>
                    <td className="px-2 py-2">
                      {turn.toolCalls.length === 0 ? "—" : turn.toolCalls.join(", ")}
                    </td>
                    <td
                      className={cx("px-2 py-2", OUTCOME_TONE[turn.outcome])}
                      title={turn.error ?? undefined}
                    >
                      {turn.outcome}
                      {turn.error ? (
                        <span className="text-vitask-text-tertiary block max-w-48 truncate">
                          {turn.error}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-vitask-text-tertiary text-[10px] tracking-[0.08em] uppercase">
        {label}
      </span>
      <span className="font-vitask-mono text-vitask-text-primary text-sm tabular-nums">
        {value}
      </span>
    </div>
  );
}
