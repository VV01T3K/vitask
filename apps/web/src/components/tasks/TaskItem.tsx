import type { Hype, Task } from "@vitask/protocol";
import { ListPlus, RotateCcw, Sparkles, X } from "lucide-react";
import { useState } from "react";

import { useParticleBurst } from "../../hooks/useParticleBurst.ts";
import { fmtMinutes, relTime } from "../../lib/format.ts";
import { useActions } from "../../state/client.tsx";
import { cx } from "../ui.tsx";
import { AddTaskInput } from "./AddTaskInput.tsx";
import { EstimateSelect } from "./EstimateSelect.tsx";

const deleteClass =
  "text-vitask-text-secondary hover:text-vitask-coral hover:bg-vitask-coral/10 hover:border-vitask-coral/30 inline-flex size-7 shrink-0 items-center justify-center rounded border border-transparent opacity-55 transition group-focus-within:opacity-100 group-hover:opacity-100 focus:opacity-100";

type TaskItemProps = {
  task: Task;
  steps: Task[];
  hype: Hype | undefined;
  pending: (id: string) => boolean;
  now: number;
};

export function TaskItem({ task, steps, hype, pending, now }: TaskItemProps) {
  const [addingStep, setAddingStep] = useState(false);
  const actions = useActions();
  const isPending = pending(task.id);
  const doneSteps = steps.filter((step) => step.status === "done").length;
  const stepMinutes = steps.reduce(
    (sum, step) => sum + (step.status === "open" ? (step.estimateMinutes ?? 0) : 0),
    0,
  );

  return (
    <li className="flex flex-col">
      {task.status === "done" ? (
        <DoneRow hype={hype} now={now} task={task} />
      ) : (
        <div
          className={cx(
            "group hover:bg-vitask-elevated focus-within:bg-vitask-elevated relative flex min-h-11 items-center gap-3 rounded px-3 transition-colors",
            task.id.startsWith("tmp-") && "animate-vitask-slide-in-top",
          )}
        >
          <CompleteButton
            disabled={isPending}
            label={task.title}
            onComplete={() => void actions.completeTask(task.id)}
          />
          <span className="text-vitask-text-primary min-w-0 flex-1 truncate text-sm">
            {task.title}
          </span>
          {steps.length > 0 ? (
            <span
              className="font-vitask-mono text-vitask-text-tertiary shrink-0 text-[11px] tabular-nums"
              title="steps done"
            >
              {doneSteps}/{steps.length}
              {stepMinutes > 0 ? ` · ${fmtMinutes(stepMinutes)}` : ""}
            </span>
          ) : null}
          <EstimateSelect
            disabled={isPending}
            label={task.title}
            onChange={(minutes) => void actions.setEstimate(task.id, minutes)}
            value={task.estimateMinutes}
          />
          <button
            aria-expanded={addingStep}
            aria-label={`Add a step to ${task.title}`}
            className="text-vitask-text-secondary hover:text-vitask-accent hover:bg-vitask-accent/10 hover:border-vitask-accent/30 inline-flex size-7 shrink-0 items-center justify-center rounded border border-transparent opacity-55 transition group-focus-within:opacity-100 group-hover:opacity-100 focus:opacity-100"
            disabled={isPending}
            onClick={() => setAddingStep((open) => !open)}
            title="Add a step"
            type="button"
          >
            <ListPlus aria-hidden="true" size={15} />
          </button>
          <button
            aria-label={`Delete ${task.title}`}
            className={deleteClass}
            disabled={isPending}
            onClick={() => void actions.deleteTask(task.id)}
            type="button"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>
      )}

      {steps.length > 0 || addingStep ? (
        <ul
          aria-label={`Steps of ${task.title}`}
          className="border-vitask-border mb-1 ml-[21px] flex flex-col border-l pl-3"
        >
          {steps.map((step) => (
            <StepRow key={step.id} pending={pending(step.id)} step={step} />
          ))}
          {addingStep ? (
            <li className="py-1 pr-3">
              <AddTaskInput
                autoFocus
                compact
                label={`New step for ${task.title}`}
                onAdd={(title) => actions.addTask({ title, parentId: task.id })}
                placeholder="Next small step..."
              />
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

function CompleteButton({
  label,
  disabled,
  onComplete,
  small,
}: {
  label: string;
  disabled: boolean;
  onComplete: () => void;
  small?: boolean;
}) {
  const [completing, setCompleting] = useState(false);
  const { particles, burst } = useParticleBurst();

  function handle() {
    if (completing || disabled) return;
    setCompleting(true);
    burst();
    // Let the check and burst play before the row moves to "completed".
    window.setTimeout(onComplete, 350);
  }

  return (
    <button
      aria-label={`Mark ${label} complete`}
      className={cx(
        "relative flex shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors",
        small ? "size-[14px]" : "size-[18px]",
        completing
          ? "border-vitask-green bg-vitask-green animate-vitask-bounce"
          : "border-vitask-text-tertiary group-hover:border-vitask-text-secondary bg-transparent",
      )}
      onClick={handle}
      type="button"
    >
      {completing ? (
        <span className="text-vitask-bg text-[10px] leading-none font-bold">✓</span>
      ) : (
        <span className="bg-vitask-text-tertiary block size-2 rounded-full opacity-0 transition-opacity group-hover:opacity-100" />
      )}
      {particles.map((p) => (
        <span
          className="vitask-particle bg-vitask-green pointer-events-none absolute top-1/2 left-1/2 size-1 rounded-full"
          key={p.id}
          style={{ "--dx": `${p.dx}px`, "--dy": `${p.dy}px` } as React.CSSProperties}
        />
      ))}
    </button>
  );
}

function ReopenButton({
  label,
  onReopen,
  small,
}: {
  label: string;
  onReopen: () => void;
  small?: boolean;
}) {
  return (
    <button
      aria-label={`Mark ${label} not done`}
      className={cx(
        "border-vitask-green hover:border-vitask-coral relative flex shrink-0 items-center justify-center rounded-full border-[1.5px] bg-transparent transition-colors [&:hover_.dot]:hidden [&:hover_.revert]:flex",
        small ? "size-[14px]" : "size-[18px]",
      )}
      onClick={onReopen}
      title="Mark not done"
      type="button"
    >
      <span className="dot bg-vitask-green ring-vitask-green/25 absolute inset-[3px] rounded-full ring-2" />
      <RotateCcw
        aria-hidden="true"
        className="revert text-vitask-coral hidden"
        size={small ? 8 : 10}
        strokeWidth={2.5}
      />
    </button>
  );
}

function DoneRow({ task, hype, now }: { task: Task; hype: Hype | undefined; now: number }) {
  const actions = useActions();
  const [showHype, setShowHype] = useState(false);
  return (
    <div className="group relative flex h-11 items-center gap-3 rounded px-3 opacity-60 transition-opacity focus-within:opacity-100 hover:opacity-100">
      <ReopenButton label={task.title} onReopen={() => void actions.reopenTask(task.id)} />
      <span className="text-vitask-text-secondary min-w-0 flex-1 truncate text-[13px] line-through">
        {task.title}
      </span>
      {task.completedAt ? (
        <span className="text-vitask-text-tertiary shrink-0 text-xs">
          {relTime(task.completedAt, now)}
        </span>
      ) : null}
      {hype?.message ? (
        <div className="relative">
          <button
            aria-label="Show the coach's note"
            className="text-vitask-text-secondary hover:text-vitask-teal hover:bg-vitask-teal/10 hover:border-vitask-teal/30 inline-flex size-7 items-center justify-center rounded border border-transparent opacity-55 transition hover:opacity-100 focus:opacity-100"
            onBlur={() => setShowHype(false)}
            onFocus={() => setShowHype(true)}
            onMouseEnter={() => setShowHype(true)}
            onMouseLeave={() => setShowHype(false)}
            type="button"
          >
            <Sparkles aria-hidden="true" size={12} strokeWidth={2.25} />
          </button>
          {showHype ? (
            <span
              className="bg-vitask-elevated border-vitask-border-bright text-vitask-teal pointer-events-none absolute right-0 bottom-[calc(100%+6px)] z-10 w-60 rounded border p-2.5 text-xs leading-relaxed font-normal whitespace-normal italic shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
              role="tooltip"
            >
              "{hype.message}"
            </span>
          ) : null}
        </div>
      ) : null}
      <button
        aria-label={`Delete ${task.title}`}
        className={deleteClass}
        onClick={() => void actions.deleteTask(task.id)}
        type="button"
      >
        <X aria-hidden="true" size={16} />
      </button>
    </div>
  );
}

function StepRow({ step, pending }: { step: Task; pending: boolean }) {
  const actions = useActions();
  const done = step.status === "done";
  return (
    <li
      className={cx(
        "group flex min-h-8 items-center gap-2.5 rounded pr-1 pl-1",
        step.id.startsWith("tmp-") && "opacity-70",
      )}
    >
      {done ? (
        <ReopenButton label={step.title} onReopen={() => void actions.reopenTask(step.id)} small />
      ) : (
        <CompleteButton
          disabled={pending}
          label={step.title}
          onComplete={() => void actions.completeTask(step.id)}
          small
        />
      )}
      <span
        className={cx(
          "min-w-0 flex-1 truncate text-[13px]",
          done ? "text-vitask-text-tertiary line-through" : "text-vitask-text-secondary",
        )}
      >
        {step.title}
      </span>
      {!done ? (
        <EstimateSelect
          disabled={pending}
          label={step.title}
          onChange={(minutes) => void actions.setEstimate(step.id, minutes)}
          value={step.estimateMinutes}
        />
      ) : null}
      <button
        aria-label={`Delete step ${step.title}`}
        className={deleteClass}
        disabled={pending}
        onClick={() => void actions.deleteTask(step.id)}
        type="button"
      >
        <X aria-hidden="true" size={14} />
      </button>
    </li>
  );
}
