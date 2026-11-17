import { LIMITS } from "@vitask/protocol";
import { ArrowUp, Loader2 } from "lucide-react";
import { useId, useState, type RefObject } from "react";

import { describeError } from "../../lib/errors.ts";
import { useActions } from "../../state/client.tsx";
import type { UiError } from "../../state/types.ts";
import { cx } from "../ui.tsx";

type ComposerProps = {
  text: string;
  setText: (text: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  connected: boolean;
  busy: boolean;
  /** Why the coach cannot take messages now (budget), if so. */
  blocked: string | null;
};

export function Composer({ text, setText, inputRef, connected, busy, blocked }: ComposerProps) {
  const actions = useActions();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const hintId = useId();
  const disabled = !connected || blocked !== null;
  const tooLong = text.length > LIMITS.chatText;

  async function send() {
    const message = text.trim();
    if (message === "" || disabled || tooLong || sending) return;
    setSending(true);
    setText("");
    const failure = await actions.sendChat(message);
    setSending(false);
    // Server refusals show on the message itself; only local validation stays here.
    if (failure?.code === "bad_request") {
      setText(message);
      setError(failure);
    }
  }

  const hint =
    blocked ??
    (!connected
      ? "Reconnecting… messages can be sent once the connection is back."
      : busy
        ? "The coach is busy; your message will wait in line."
        : "Enter to send · Shift+Enter for a new line");

  return (
    <form
      className="border-vitask-border flex flex-col gap-1.5 border-t p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <div
        className={cx(
          "bg-vitask-bg border-vitask-border focus-within:border-vitask-accent flex items-end gap-2 rounded-md border p-1.5 pl-3 transition-colors",
          disabled && "opacity-60",
        )}
      >
        <textarea
          aria-describedby={hintId}
          aria-label="Message the coach"
          className="placeholder:text-vitask-text-tertiary text-vitask-text-primary max-h-36 min-h-8 flex-1 resize-none border-none bg-transparent py-1.5 text-[13px] leading-relaxed outline-none focus-visible:outline-none"
          disabled={disabled}
          onChange={(event) => {
            setError(null);
            setText(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder={busy ? "Add to the queue…" : "Ask the coach…"}
          ref={inputRef}
          rows={Math.min(5, Math.max(1, text.split("\n").length))}
          value={text}
        />
        <button
          aria-label="Send message"
          className="bg-vitask-accent/15 border-vitask-accent/40 hover:bg-vitask-accent/25 hover:border-vitask-accent text-vitask-accent inline-flex size-8 shrink-0 items-center justify-center rounded border transition disabled:cursor-not-allowed disabled:opacity-40"
          disabled={disabled || text.trim() === "" || tooLong}
          type="submit"
        >
          {sending ? (
            <Loader2 aria-hidden="true" className="animate-spin" size={14} />
          ) : (
            <ArrowUp aria-hidden="true" size={15} />
          )}
        </button>
      </div>
      <p
        className={cx(
          "flex justify-between gap-2 px-1 text-[11px]",
          blocked || error ? "text-vitask-coral" : "text-vitask-text-tertiary",
        )}
        id={hintId}
      >
        <span>{error ? describeError(error) : hint}</span>
        {text.length > LIMITS.chatText * 0.8 ? (
          <span className={cx("font-vitask-mono tabular-nums", tooLong && "text-vitask-coral")}>
            {text.length}/{LIMITS.chatText}
          </span>
        ) : null}
      </p>
    </form>
  );
}
