import type { CareTimer } from "@vitask/protocol";
import { Loader2 } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { describeError } from "../../lib/errors.ts";
import { defaultTimerAppearance, type TimerAppearance } from "../../lib/timerAppearance.ts";
import { useActions } from "../../state/client.tsx";
import type { UiError } from "../../state/types.ts";
import { buttonClass, ErrorText, ModalHeader, useDialogFocus } from "../ui.tsx";
import { TimerAppearancePicker } from "./TimerAppearancePicker.tsx";

const inputClass =
  "bg-vitask-elevated border-vitask-border text-vitask-text-primary focus:border-vitask-accent rounded border px-3 py-2.5 text-sm transition-colors outline-none";
const durationClass =
  "bg-vitask-elevated border-vitask-border text-vitask-text-primary font-vitask-mono focus:border-vitask-accent w-[65px] rounded border px-2 py-2.5 text-center text-sm transition-colors outline-none";

type Form = {
  label: string;
  hours: string;
  minutes: string;
  seconds: string;
  purpose: string;
  instructions: string;
  appearance: TimerAppearance;
};

function toForm(timer: CareTimer | undefined): Form {
  const total = timer?.intervalSeconds ?? 30 * 60;
  return {
    label: timer?.label ?? "",
    hours: String(Math.floor(total / 3600)),
    minutes: String(Math.floor((total % 3600) / 60)),
    seconds: String(total % 60),
    purpose: timer?.purpose ?? "",
    instructions: timer?.instructions ?? "",
    appearance: timer ? { icon: timer.icon, color: timer.color } : defaultTimerAppearance,
  };
}

/** Create or edit a care timer. Validation is the protocol's schema; server errors stay in the form. */
export function TimerModal({ timer, onClose }: { timer?: CareTimer; onClose: () => void }) {
  const actions = useActions();
  const [form, setForm] = useState(() => toForm(timer));
  const [error, setError] = useState<UiError | null>(null);
  const [busy, setBusy] = useState(false);
  const dialog = useDialogFocus(onClose);
  const titleId = useId();
  const set = (patch: Partial<Form>) => {
    setError(null);
    setForm((current) => ({ ...current, ...patch }));
  };
  const issue = (path: string) => error?.issues?.find((item) => item.path === path)?.message;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const body = {
      label: form.label,
      intervalSeconds:
        (Number(form.hours) || 0) * 3600 +
        (Number(form.minutes) || 0) * 60 +
        (Number(form.seconds) || 0),
      purpose: form.purpose.trim(),
      instructions: form.instructions.trim(),
      icon: form.appearance.icon,
      color: form.appearance.color,
    };
    const failure = timer
      ? await actions.updateTimer(timer.id, body)
      : await actions.createTimer(body);
    setBusy(false);
    if (failure) setError(failure);
    else onClose();
  }

  return (
    <div
      className="vitask-modal-backdrop fixed inset-0 z-[100] flex items-end justify-center bg-[var(--vitask-backdrop)] sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="vitask-modal-in bg-vitask-surface border-vitask-border-bright max-h-[100dvh] w-full max-w-[560px] overflow-y-auto rounded-t-lg border shadow-[0_20px_60px_rgba(0,0,0,0.5)] sm:rounded-lg"
        ref={dialog}
        role="dialog"
      >
        <ModalHeader id={titleId} onClose={onClose} title={timer ? "Edit Timer" : "Create Timer"} />
        <form noValidate onSubmit={submit}>
          <div className="flex flex-col sm:flex-row">
            <div className="flex min-w-0 flex-1 flex-col gap-4 p-5">
              <Field error={issue("label")} label="Title">
                <input
                  autoFocus
                  className={inputClass}
                  disabled={busy}
                  maxLength={120}
                  onChange={(e) => set({ label: e.target.value })}
                  placeholder="Stretch break"
                  value={form.label}
                />
              </Field>

              <fieldset className="flex flex-col gap-3">
                <legend className="text-vitask-text-tertiary mb-3 text-[11px] font-medium tracking-[0.08em] uppercase">
                  Every
                </legend>
                <div className="flex items-center gap-2.5">
                  {(["hours", "minutes", "seconds"] as const).map((unit) => (
                    <label className="flex items-center gap-1.5" key={unit}>
                      <input
                        aria-label={unit}
                        className={durationClass}
                        disabled={busy}
                        max={unit === "hours" ? 24 : 59}
                        min={0}
                        onChange={(e) => set({ [unit]: e.target.value })}
                        type="number"
                        value={form[unit]}
                      />
                      <span aria-hidden="true" className="text-vitask-text-secondary text-[13px]">
                        {unit[0]}
                      </span>
                    </label>
                  ))}
                </div>
                {issue("intervalSeconds") ? (
                  <p className="text-vitask-coral text-[11px]">{issue("intervalSeconds")}</p>
                ) : null}
              </fieldset>

              <Field error={issue("purpose")} label="What it's for (optional)">
                <input
                  className={inputClass}
                  disabled={busy}
                  maxLength={240}
                  onChange={(e) => set({ purpose: e.target.value })}
                  placeholder="Drink some water"
                  value={form.purpose}
                />
              </Field>

              <Field
                error={issue("instructions")}
                label="How the coach should nudge you (optional)"
              >
                <textarea
                  className={`${inputClass} font-vitask-mono min-h-24 resize-none text-[13px] leading-[1.55]`}
                  disabled={busy}
                  maxLength={1000}
                  onChange={(e) => set({ instructions: e.target.value })}
                  placeholder="Short and playful. Mention what I'm working on."
                  rows={4}
                  value={form.instructions}
                />
              </Field>

              {error && !error.issues?.length ? (
                <ErrorText>{describeError(error)}</ErrorText>
              ) : null}
            </div>

            <div className="border-vitask-border flex shrink-0 flex-col items-center gap-3 border-t px-3 py-4 sm:border-t-0 sm:border-l sm:py-5">
              <span className="text-vitask-text-tertiary text-[10px] font-medium tracking-[0.08em] uppercase">
                Icon
              </span>
              <div className="hidden sm:block">
                <TimerAppearancePicker
                  disabled={busy}
                  onChange={(appearance) => set({ appearance })}
                  value={form.appearance}
                  vertical
                />
              </div>
              <div className="sm:hidden">
                <TimerAppearancePicker
                  disabled={busy}
                  onChange={(appearance) => set({ appearance })}
                  value={form.appearance}
                />
              </div>
            </div>
          </div>
          <div className="border-vitask-border flex justify-end gap-2.5 border-t px-5 py-3.5">
            <button className={buttonClass.secondary} onClick={onClose} type="button">
              Cancel
            </button>
            <button className={buttonClass.primary} disabled={busy} type="submit">
              {busy ? <Loader2 aria-hidden="true" className="animate-spin" size={14} /> : null}
              {timer ? "Save Changes" : "Create Timer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error: string | undefined;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-vitask-text-tertiary text-[11px] font-medium tracking-[0.08em] uppercase">
        {label}
      </span>
      {children}
      {error ? (
        <span className="text-vitask-coral text-[11px]" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
