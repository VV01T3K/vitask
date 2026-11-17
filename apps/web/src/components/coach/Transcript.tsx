import { RotateCw, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { describeError } from "../../lib/errors.ts";
import { useActions, useAppState } from "../../state/client.tsx";
import { buildTranscript, type TranscriptItem } from "../../state/transcript.ts";
import type { State } from "../../state/types.ts";
import { cx, Cursor } from "../ui.tsx";
import { ApprovalCard } from "./ApprovalCard.tsx";
import { ToolRow } from "./ToolRow.tsx";

const selectServer = (state: State) => state.server;
const selectChats = (state: State) => state.chats;

const SUGGESTIONS = [
  "Break my top task into small steps",
  "Plan my next hour of focus",
  "Remind me to drink water every 45 minutes",
];

export function Transcript({ onSuggest }: { onSuggest: (text: string) => void }) {
  const server = useAppState(selectServer);
  const chats = useAppState(selectChats);
  const items = useMemo(() => (server ? buildTranscript(server, chats) : []), [server, chats]);
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  // Follow new output unless the user scrolled up to read.
  useEffect(() => {
    const element = scroller.current;
    if (element && pinned.current) element.scrollTop = element.scrollHeight;
  }, [items]);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
      onScroll={(event) => {
        const element = event.currentTarget;
        pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
      }}
      ref={scroller}
      role="log"
      aria-label="Coach conversation"
      aria-live="polite"
      aria-relevant="additions"
      tabIndex={0}
    >
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-start justify-end gap-2">
          <p className="font-vitask-mono text-vitask-text-tertiary text-[12px]">
            // ask for a plan, a breakdown, or a gentle nudge.
          </p>
          <p className="text-vitask-text-tertiary text-xs">
            The coach can read your tasks and timers. It asks before it changes anything.
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((text) => (
              <button
                className="border-vitask-border text-vitask-text-secondary hover:border-vitask-accent/50 hover:text-vitask-accent rounded-full border px-2.5 py-1 text-xs transition"
                key={text}
                onClick={() => onSuggest(text)}
                type="button"
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      ) : (
        items.map((item) => <Item item={item} key={item.key} />)
      )}
    </div>
  );
}

function Speaker({ who }: { who: "you" | "coach" }) {
  return (
    <span
      className={cx(
        "font-vitask-mono shrink-0 pt-px text-[11px] select-none",
        who === "you" ? "text-vitask-text-tertiary" : "text-vitask-teal",
      )}
    >
      {who === "you" ? "you ›" : "coach ›"}
    </span>
  );
}

function Item({ item }: { item: TranscriptItem }) {
  const actions = useActions();
  switch (item.kind) {
    case "user":
      return (
        <div className="flex gap-2.5">
          <Speaker who="you" />
          <p className="text-vitask-text-primary min-w-0 flex-1 text-[13px] leading-relaxed whitespace-pre-wrap">
            {item.text}
          </p>
        </div>
      );
    case "pending":
      return (
        <div className="flex flex-col gap-1.5" data-chat-status={item.chat.status}>
          <div className="flex gap-2.5">
            <Speaker who="you" />
            <p className="text-vitask-text-secondary min-w-0 flex-1 text-[13px] leading-relaxed whitespace-pre-wrap">
              {item.chat.text}
            </p>
            <span
              className={cx(
                "font-vitask-mono h-fit shrink-0 rounded-full border px-1.5 py-px text-[10px] tracking-[0.08em] uppercase",
                item.chat.status === "failed"
                  ? "border-vitask-coral/40 text-vitask-coral"
                  : "border-vitask-border text-vitask-text-tertiary",
              )}
            >
              {item.chat.status === "failed" ? "not sent" : item.queued ? "queued" : "sending"}
            </span>
          </div>
          {item.chat.status === "failed" && item.chat.error ? (
            <div className="ml-11 flex flex-wrap items-center gap-2" role="alert">
              <span className="text-vitask-coral text-xs">{describeError(item.chat.error)}</span>
              <button
                className="text-vitask-text-secondary hover:text-vitask-accent inline-flex items-center gap-1 text-xs"
                onClick={() => {
                  actions.dismissChat(item.chat.requestId);
                  void actions.sendChat(item.chat.text);
                }}
                type="button"
              >
                <RotateCw aria-hidden="true" size={11} /> retry
              </button>
              <button
                className="text-vitask-text-tertiary hover:text-vitask-text-primary inline-flex items-center gap-1 text-xs"
                onClick={() => actions.dismissChat(item.chat.requestId)}
                type="button"
              >
                <X aria-hidden="true" size={11} /> dismiss
              </button>
            </div>
          ) : null}
        </div>
      );
    case "assistant":
    case "live":
      return (
        <div
          aria-busy={item.kind === "live" || undefined}
          className="flex gap-2.5"
          data-live={item.kind === "live" || undefined}
        >
          <Speaker who="coach" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {item.text ? (
              <p className="text-vitask-text-primary text-[13px] leading-relaxed whitespace-pre-wrap">
                {item.text}
                {item.kind === "live" ? <Cursor /> : null}
              </p>
            ) : item.kind === "live" && item.tools.length === 0 ? (
              <p className="vitask-shimmer text-vitask-text-tertiary w-fit rounded px-1 text-[13px]">
                thinking…
              </p>
            ) : null}
            {item.tools.map((tool) => (
              <ToolRow key={tool.callId} tool={tool} />
            ))}
          </div>
        </div>
      );
    case "notice":
      return (
        <p
          className={cx(
            "font-vitask-mono text-center text-[11px]",
            item.isError ? "text-vitask-coral" : "text-vitask-text-tertiary",
          )}
        >
          — {item.text} —
        </p>
      );
    case "approval":
      return <ApprovalCard approval={item.approval} />;
  }
}
