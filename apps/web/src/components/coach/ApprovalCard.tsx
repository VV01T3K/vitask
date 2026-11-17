import type { Approval } from "@vitask/protocol";
import { Check, CircleSlash, Clock, Loader2, ShieldQuestion, X } from "lucide-react";
import { useId } from "react";

import { useNow } from "../../hooks/useNow.ts";
import { describeError } from "../../lib/errors.ts";
import { clockTime, fmtTime } from "../../lib/format.ts";
import { useActions, useAppState } from "../../state/client.tsx";
import { cx } from "../ui.tsx";
import { toolInfo } from "./tools.ts";

const RESOLVED: Record<
  Exclude<Approval["status"], "pending">,
  { label: string; tone: string; Icon: typeof Check }
> = {
  approved: { label: "Approved · applying", tone: "text-vitask-accent", Icon: Loader2 },
  applied: { label: "Applied", tone: "text-vitask-green", Icon: Check },
  rejected: { label: "Rejected · nothing changed", tone: "text-vitask-coral", Icon: X },
  expired: { label: "Expired · nothing changed", tone: "text-vitask-text-tertiary", Icon: Clock },
  failed: { label: "Could not apply", tone: "text-vitask-coral", Icon: CircleSlash },
};

/** The human-in-the-loop moment: what the coach wants to change, and the user's call. */
export function ApprovalCard({ approval }: { approval: Approval }) {
  const actions = useActions();
  const decision = useAppState((state) => state.decisions[approval.id]);
  const offset = useAppState((state) => state.clockOffsetMs);
  const connected = useAppState((state) => state.connection.status === "open");
  const pending = approval.status === "pending";
  const now = useNow(pending ? 1000 : 60_000, offset);
  const summaryId = useId();
  const { label, Icon } = toolInfo(approval.tool);

  const total = Math.max(1, approval.expiresAt - approval.createdAt);
  const left = Math.max(0, approval.expiresAt - now);
  const deciding = decision !== undefined && decision.error === null;

  return (
    <article
      aria-labelledby={summaryId}
      className={cx(
        "bg-vitask-surface relative overflow-hidden rounded-md border transition-colors",
        pending ? "vitask-approval-pending" : "border-vitask-border",
      )}
      data-approval-status={approval.status}
    >
      <div
        className={cx(
          "flex items-center gap-2 border-b px-3.5 py-2",
          pending ? "border-vitask-accent/25 bg-vitask-accent/8" : "border-vitask-border",
        )}
      >
        {pending ? (
          <span className="font-vitask-mono text-vitask-accent inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] uppercase">
            <ShieldQuestion aria-hidden="true" size={12} strokeWidth={2.25} />
            needs your ok
          </span>
        ) : (
          <ResolvedStamp approval={approval} />
        )}
        {pending ? (
          <span
            aria-label={`Expires in ${fmtTime(left / 1000)}`}
            className={cx(
              "font-vitask-mono ml-auto text-[11px] tabular-nums",
              left < 60_000 ? "text-vitask-amber" : "text-vitask-text-tertiary",
            )}
            role="timer"
          >
            {left > 0 ? `${fmtTime(left / 1000)} left` : "expiring…"}
          </span>
        ) : (
          <span className="font-vitask-mono text-vitask-text-tertiary ml-auto text-[11px]">
            {clockTime(approval.decidedAt ?? approval.createdAt)}
          </span>
        )}
      </div>

      <p
        className={cx(
          "px-3.5 pt-3 pb-2 text-[15px] leading-snug font-medium whitespace-pre-line",
          pending ? "text-vitask-text-primary" : "text-vitask-text-secondary",
        )}
        id={summaryId}
      >
        {approval.summary}
      </p>

      {approval.status === "failed" && approval.result ? (
        <p className="text-vitask-coral px-3.5 pb-2 text-xs">{approval.result}</p>
      ) : null}

      {pending ? (
        <div className="flex flex-wrap items-center gap-2 px-3.5 pb-3">
          <button
            className="border-vitask-green/50 bg-vitask-green/10 text-vitask-green hover:border-vitask-green hover:bg-vitask-green/20 inline-flex min-w-28 flex-1 items-center justify-center gap-1.5 rounded border px-3 py-2 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
            disabled={deciding || !connected}
            onClick={() => void actions.decide(approval.id, "approve")}
            type="button"
          >
            {deciding && decision.decision === "approve" ? (
              <Loader2 aria-hidden="true" className="animate-spin" size={14} />
            ) : (
              <Check aria-hidden="true" size={14} strokeWidth={2.5} />
            )}
            Approve
          </button>
          <button
            className="border-vitask-border text-vitask-text-secondary hover:border-vitask-coral/60 hover:text-vitask-coral inline-flex min-w-24 flex-1 items-center justify-center gap-1.5 rounded border bg-transparent px-3 py-2 text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
            disabled={deciding || !connected}
            onClick={() => void actions.decide(approval.id, "reject")}
            type="button"
          >
            {deciding && decision.decision === "reject" ? (
              <Loader2 aria-hidden="true" className="animate-spin" size={14} />
            ) : (
              <X aria-hidden="true" size={14} />
            )}
            Reject
          </button>
        </div>
      ) : null}

      {pending && decision?.error ? (
        <p className="text-vitask-coral px-3.5 pb-3 text-xs" role="alert">
          {describeError(decision.error)}
        </p>
      ) : pending && !connected ? (
        <p className="text-vitask-text-tertiary px-3.5 pb-3 text-xs">
          Reconnecting… you can decide once the connection is back.
        </p>
      ) : null}

      <details className="px-3.5 pb-2.5">
        <summary className="font-vitask-mono text-vitask-text-tertiary hover:text-vitask-text-secondary flex w-fit cursor-pointer items-center gap-1.5 text-[11px] select-none">
          <Icon aria-hidden="true" size={11} />
          {label} · exact change
        </summary>
        <pre className="font-vitask-mono bg-vitask-elevated text-vitask-text-secondary mt-1.5 max-h-48 overflow-auto rounded p-2 text-[11px] leading-relaxed">
          {approval.tool}({JSON.stringify(approval.args, null, 2)})
        </pre>
      </details>

      {pending ? (
        <div aria-hidden="true" className="bg-vitask-border h-0.5">
          <div
            className="bg-vitask-accent h-full transition-[width] duration-1000 ease-linear"
            style={{ width: `${(left / total) * 100}%` }}
          />
        </div>
      ) : null}
    </article>
  );
}

function ResolvedStamp({ approval }: { approval: Approval }) {
  const { label, tone, Icon } = RESOLVED[approval.status as keyof typeof RESOLVED];
  return (
    <span
      className={cx(
        "font-vitask-mono inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] uppercase",
        tone,
      )}
    >
      <Icon
        aria-hidden="true"
        className={approval.status === "approved" ? "animate-spin" : undefined}
        size={12}
        strokeWidth={2.5}
      />
      {label}
    </span>
  );
}
