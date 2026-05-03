import { useServerFn } from "@tanstack/react-start";
import { model } from "@vitask/backend-api";
import { Loader2, Sparkle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";

import { generateTimerInstructionsFn } from "#/functions/timer.functions";
import { useTypewriter } from "#/hooks/useTypewriter";
import { useAppForm } from "#/integrations/tanstack/form";
import {
  defaultTimerAppearance,
  normalizeTimerAppearance,
  type TimerAppearance,
  type TimerIconKey,
} from "#/lib/timerAppearance";

import { TimerAppearancePicker } from "./TimerAppearancePicker";

type TimerResponse = model.TimerResponse;

const timerDurationMinMinutes = model.createTimerRequestDurationSecondsMinOne / 60;
const timerDurationMaxMinutes = model.createTimerRequestDurationSecondsMaxOne / 60;

const timerFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(
      model.createTimerRequestTitleMin,
      `Title must be at least ${model.createTimerRequestTitleMin} characters.`,
    )
    .max(
      model.createTimerRequestTitleMax,
      `Title must be at most ${model.createTimerRequestTitleMax} characters.`,
    ),
  description: z
    .string()
    .trim()
    .max(
      model.createTimerRequestDescriptionMax,
      `Description must be at most ${model.createTimerRequestDescriptionMax} characters.`,
    ),
  hours: z.string().trim().default("0"),
  minutes: z.string().trim().default("30"),
  seconds: z.string().trim().default("0"),
  aiInstructions: z
    .string()
    .trim()
    .min(1, "AI instructions are required.")
    .max(
      model.createTimerRequestAiInstructionsMax,
      `AI instructions must be at most ${model.createTimerRequestAiInstructionsMax} characters.`,
    ),
  icon: z.string().trim().default(defaultTimerAppearance.icon),
  color: z.string().trim().default(defaultTimerAppearance.color),
});

type TimerFormValues = z.input<typeof timerFormSchema>;
export type TimerSubmitValues = {
  title: string;
  description: string;
  durationSeconds: number;
  aiInstructions: string;
  appearance: TimerAppearance;
};

const emptyTimerFormValues: TimerFormValues = {
  title: "",
  description: "",
  hours: "0",
  minutes: "30",
  seconds: "0",
  aiInstructions: "",
  icon: defaultTimerAppearance.icon,
  color: defaultTimerAppearance.color,
};

function timerToFormValues(timer: TimerResponse): TimerFormValues {
  const totalSeconds = Number(timer.durationSeconds);
  return {
    title: timer.title,
    description: timer.description,
    hours: String(Math.floor(totalSeconds / 3600)),
    minutes: String(Math.floor((totalSeconds % 3600) / 60)),
    seconds: String(totalSeconds % 60),
    aiInstructions: timer.aiInstructions,
    icon: timer.icon,
    color: timer.color,
  };
}

type CreateTimerModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: TimerSubmitValues) => Promise<boolean>;
  activeTaskTitles: string[];
  isSubmitting: boolean;
  errorMessage?: string | null;
  timer?: TimerResponse;
};

export function CreateTimerModal({
  open,
  onClose,
  onSubmit,
  activeTaskTitles,
  isSubmitting,
  errorMessage,
  timer,
}: CreateTimerModalProps) {
  const isEditing = timer !== undefined;
  const generateInstructions = useServerFn(generateTimerInstructionsFn);
  const [generating, setGenerating] = useState(false);
  const [streamingTarget, setStreamingTarget] = useState<string | null>(null);
  const { text: typedText, done: typingDone } = useTypewriter(streamingTarget ?? "");
  const form = useAppForm({
    defaultValues: isEditing ? timerToFormValues(timer) : emptyTimerFormValues,
    validators: {
      onChange: timerFormSchema,
      onSubmit: timerFormSchema,
    },
    onSubmit: async ({ value, formApi }) => {
      const parsed = toTimerSubmitValues(value);
      if (!parsed) return;

      const success = await onSubmit(parsed);

      if (success) {
        if (!isEditing) formApi.reset();
        onClose();
      }
    },
  });

  useEffect(() => {
    if (!open) {
      setGenerating(false);
      setStreamingTarget(null);
      form.reset(isEditing ? timerToFormValues(timer) : emptyTimerFormValues);
    }
  }, [form, isEditing, open, timer]);

  useEffect(() => {
    if (!streamingTarget) return;
    form.setFieldValue("aiInstructions", typedText);
    if (typingDone) setStreamingTarget(null);
  }, [form, streamingTarget, typedText, typingDone]);

  if (!open) return null;

  async function handleGenerate() {
    const title = form.getFieldValue("title").trim();
    if (!title) return;

    setGenerating(true);
    try {
      const result = await generateInstructions({
        data: {
          title,
          description: form.getFieldValue("description").trim(),
          activeTaskTitles,
        },
      });
      setStreamingTarget(result);
    } finally {
      setGenerating(false);
    }
  }

  const isStreaming = streamingTarget !== null;

  return (
    <div
      className="vitask-modal-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-[var(--vitask-backdrop)]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="vitask-modal-in bg-vitask-surface border-vitask-border-bright w-full max-w-[560px] rounded-lg border shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
        <div className="border-vitask-border flex items-center justify-between border-b px-5 py-4">
          <span className="font-vitask-mono text-vitask-text-primary text-sm font-medium tracking-[-0.01em]">
            {isEditing ? "Edit Timer" : "Create Timer"}
          </span>
          <button
            aria-label="Close"
            className="text-vitask-text-tertiary hover:bg-vitask-elevated hover:text-vitask-text-primary inline-flex size-7 items-center justify-center rounded transition"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit().catch((error: unknown) => {
              console.error("Unable to submit timer", error);
            });
          }}
        >
          <div className="flex">
            <div className="flex min-w-0 flex-1 flex-col gap-4 p-5">
              <form.AppField name="title">
                {(field) => (
                  <Field
                    errors={field.state.meta.errors}
                    label="Title"
                    touched={field.state.meta.isTouched}
                  >
                    <input
                      autoFocus
                      className="bg-vitask-elevated border-vitask-border text-vitask-text-primary focus:border-vitask-accent rounded border px-3 py-2.5 text-sm transition-colors outline-none"
                      disabled={isSubmitting}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      placeholder="Stretch break"
                      value={field.state.value}
                    />
                  </Field>
                )}
              </form.AppField>

              <div className="flex flex-col gap-3">
                <span className="text-vitask-text-tertiary text-[11px] font-medium tracking-[0.08em] uppercase">
                  Duration
                </span>
                <div className="flex items-center gap-2.5">
                  <form.AppField name="hours">
                    {(field) => (
                      <div className="flex items-center gap-1.5">
                        <input
                          className="bg-vitask-elevated border-vitask-border text-vitask-text-primary font-vitask-mono focus:border-vitask-accent w-[65px] rounded border px-2 py-2.5 text-center text-sm transition-colors outline-none"
                          disabled={isSubmitting}
                          max="99"
                          min="0"
                          name={field.name}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.target.value)}
                          type="number"
                          value={field.state.value}
                        />
                        <span className="text-vitask-text-secondary text-[13px]">h</span>
                      </div>
                    )}
                  </form.AppField>
                  <form.AppField name="minutes">
                    {(field) => (
                      <div className="flex items-center gap-1.5">
                        <input
                          className="bg-vitask-elevated border-vitask-border text-vitask-text-primary font-vitask-mono focus:border-vitask-accent w-[65px] rounded border px-2 py-2.5 text-center text-sm transition-colors outline-none"
                          disabled={isSubmitting}
                          max="59"
                          min="0"
                          name={field.name}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.target.value)}
                          type="number"
                          value={field.state.value}
                        />
                        <span className="text-vitask-text-secondary text-[13px]">m</span>
                      </div>
                    )}
                  </form.AppField>
                  <form.AppField name="seconds">
                    {(field) => (
                      <div className="flex items-center gap-1.5">
                        <input
                          className="bg-vitask-elevated border-vitask-border text-vitask-text-primary font-vitask-mono focus:border-vitask-accent w-[65px] rounded border px-2 py-2.5 text-center text-sm transition-colors outline-none"
                          disabled={isSubmitting}
                          max="59"
                          min="0"
                          name={field.name}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.target.value)}
                          type="number"
                          value={field.state.value}
                        />
                        <span className="text-vitask-text-secondary text-[13px]">s</span>
                      </div>
                    )}
                  </form.AppField>
                </div>
              </div>

              <form.AppField name="description">
                {(field) => (
                  <Field
                    errors={field.state.meta.errors}
                    label="Description (optional)"
                    touched={field.state.meta.isTouched}
                  >
                    <input
                      className="bg-vitask-elevated border-vitask-border text-vitask-text-primary focus:border-vitask-accent rounded border px-3 py-2.5 text-sm transition-colors outline-none"
                      disabled={isSubmitting}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      placeholder="Shown when timer fires"
                      value={field.state.value}
                    />
                  </Field>
                )}
              </form.AppField>

              <form.AppField name="aiInstructions">
                {(field) => (
                  <Field
                    errors={field.state.meta.errors}
                    label="AI Instructions"
                    touched={field.state.meta.isTouched}
                  >
                    <textarea
                      className="bg-vitask-elevated border-vitask-border text-vitask-text-primary font-vitask-mono focus:border-vitask-accent min-h-24 resize-y rounded border px-3 py-2.5 text-[13px] leading-[1.55] transition-colors outline-none"
                      disabled={isSubmitting || isStreaming}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      placeholder="When this fires, remind me to..."
                      rows={4}
                      value={field.state.value}
                    />
                  </Field>
                )}
              </form.AppField>

              <form.Subscribe
                selector={(state) => ({
                  title: state.values.title,
                  canSubmit: state.canSubmit,
                })}
              >
                {({ title, canSubmit }) => (
                  <>
                    <button
                      className="border-vitask-teal/45 text-vitask-teal hover:bg-vitask-teal/10 hover:border-vitask-teal inline-flex items-center gap-2 self-start rounded border bg-transparent px-3 py-2 text-xs font-medium transition disabled:cursor-wait disabled:opacity-60"
                      disabled={generating || isStreaming || isSubmitting || !title.trim()}
                      onClick={() => {
                        void handleGenerate();
                      }}
                      type="button"
                    >
                      {generating ? (
                        <>
                          <Loader2 aria-hidden="true" className="animate-spin" size={12} />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkle aria-hidden="true" size={12} strokeWidth={2.25} />
                          Auto-generate from title + tasks
                        </>
                      )}
                    </button>

                    {errorMessage ? (
                      <p className="rounded border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                        {errorMessage}
                      </p>
                    ) : null}

                    <div className="border-vitask-border -mx-5 mt-1 flex justify-end gap-2.5 border-t px-5 py-3.5">
                      <button
                        className="border-vitask-border text-vitask-text-secondary hover:border-vitask-border-bright hover:text-vitask-text-primary rounded border bg-transparent px-4 py-2 text-[13px] transition"
                        onClick={onClose}
                        type="button"
                      >
                        Cancel
                      </button>
                      <button
                        className="bg-vitask-accent/15 border-vitask-accent/40 hover:bg-vitask-accent/25 hover:border-vitask-accent text-vitask-accent inline-flex items-center gap-2 rounded border px-4 py-2 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!canSubmit || generating || isStreaming || isSubmitting}
                        type="submit"
                      >
                        {isSubmitting ? (
                          <Loader2 aria-hidden="true" className="animate-spin" size={14} />
                        ) : null}
                        {isEditing ? "Save Changes" : "Create Timer"}
                      </button>
                    </div>
                  </>
                )}
              </form.Subscribe>
            </div>

            <div className="border-vitask-border flex shrink-0 flex-col items-center gap-3 border-l px-3 py-5">
              <span className="text-vitask-text-tertiary text-[10px] font-medium tracking-[0.08em] uppercase">
                Icon
              </span>
              <form.Subscribe
                selector={(state) => ({
                  icon: state.values.icon as TimerIconKey,
                  color: state.values.color,
                })}
              >
                {({ icon, color }) => (
                  <TimerAppearancePicker
                    disabled={isSubmitting}
                    onChange={(next) => {
                      form.setFieldValue("icon", next.icon);
                      form.setFieldValue("color", next.color);
                    }}
                    value={normalizeTimerAppearance({ icon, color })}
                    vertical
                  />
                )}
              </form.Subscribe>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function toTimerSubmitValues(values: TimerFormValues): TimerSubmitValues | null {
  const title = values.title.trim();
  const description = values.description.trim();
  const hours = Number(values.hours?.trim()) || 0;
  const minutes = Number(values.minutes?.trim()) || 0;
  const seconds = Number(values.seconds?.trim()) || 0;
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;

  if (totalSeconds < model.createTimerRequestDurationSecondsMinOne) {
    console.warn(
      `Duration must be at least ${timerDurationMinMinutes} minute${timerDurationMinMinutes === 1 ? "" : "s"}.`,
    );
    return null;
  }

  if (totalSeconds > model.createTimerRequestDurationSecondsMaxOne) {
    console.warn(`Duration must be ${timerDurationMaxMinutes} minutes or less.`);
    return null;
  }

  return {
    title,
    description: description || `Check in for ${title}`,
    durationSeconds: totalSeconds,
    aiInstructions: values.aiInstructions.trim(),
    appearance: normalizeTimerAppearance({
      icon: values.icon as TimerIconKey,
      color: values.color,
    }),
  };
}

function Field({
  label,
  touched,
  errors,
  children,
}: {
  label: string;
  touched: boolean;
  errors: unknown[];
  children: React.ReactNode;
}) {
  const messages = touched ? getFieldErrorMessages(errors) : [];

  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex flex-col gap-1.5">
        <span className="text-vitask-text-tertiary text-[11px] font-medium tracking-[0.08em] uppercase">
          {label}
        </span>
        {children}
      </label>
      {messages.length > 0 ? (
        <div className="flex flex-col gap-1">
          {messages.map((message, index) => (
            <p className="text-[11px] text-red-300" key={`${message}-${index}`}>
              {message}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getFieldErrorMessages(errors: unknown[]): string[] {
  return [...new Set(flattenFieldErrors(errors))];
}

function flattenFieldErrors(errors: unknown[]): string[] {
  return errors.flatMap((error) => {
    if (!error) return [];
    if (Array.isArray(error)) return flattenFieldErrors(error);
    if (typeof error === "string") return [error];
    if (typeof error === "object" && "message" in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string") return [message];
    }
    return ["Invalid value"];
  });
}
