import { Loader2 } from "lucide-react";
import { useId, useState } from "react";

import { describeError } from "../../lib/errors.ts";
import type { UiError } from "../../state/types.ts";
import { cx } from "../ui.tsx";

/** One-line task (or step) entry; the protocol schema validates it in `onAdd`. */
export function AddTaskInput({
  onAdd,
  placeholder,
  label,
  compact,
  autoFocus,
}: {
  onAdd: (title: string) => Promise<UiError | null>;
  placeholder: string;
  label: string;
  compact?: boolean;
  autoFocus?: boolean;
}) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<UiError | null>(null);
  const [busy, setBusy] = useState(false);
  const errorId = useId();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || title.trim() === "") return;
    setBusy(true);
    const text = title;
    setTitle(""); // optimistic: the task shows at once, the field is ready for the next one
    const failure = await onAdd(text);
    setBusy(false);
    if (failure) {
      setTitle(text);
      setError(failure);
    }
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={submit}>
      <div className="flex items-center gap-2">
        <div
          className={cx(
            "bg-vitask-surface border-vitask-border focus-within:border-vitask-accent flex flex-1 items-center gap-2.5 rounded-md border px-3.5 transition-colors",
            compact ? "h-8" : "h-11",
          )}
        >
          <input
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error ? true : undefined}
            aria-label={label}
            autoFocus={autoFocus}
            className={cx(
              "placeholder:text-vitask-text-tertiary text-vitask-text-primary flex-1 border-none bg-transparent outline-none focus-visible:outline-none",
              compact ? "text-[13px]" : "text-sm",
            )}
            maxLength={200}
            onChange={(event) => {
              setError(null);
              setTitle(event.target.value);
            }}
            placeholder={placeholder}
            type="text"
            value={title}
          />
        </div>
        <button
          aria-label={label}
          className={cx(
            "bg-vitask-accent/15 border-vitask-accent/40 hover:bg-vitask-accent/25 hover:border-vitask-accent text-vitask-accent inline-flex shrink-0 items-center justify-center rounded-md border leading-none transition-colors select-none disabled:opacity-40",
            compact ? "size-8 text-base" : "size-11 text-lg",
          )}
          disabled={title.trim() === ""}
          type="submit"
        >
          {busy ? <Loader2 aria-hidden="true" className="animate-spin" size={14} /> : "+"}
        </button>
      </div>
      {error ? (
        <p className="text-vitask-coral px-1 text-[11px]" id={errorId} role="alert">
          {describeError(error)}
        </p>
      ) : null}
    </form>
  );
}
