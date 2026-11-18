import { CalendarClock } from "lucide-react";

import { clockTime, fmtMinutes } from "../lib/format.ts";
import { useAppState } from "../state/client.tsx";
import type { State } from "../state/types.ts";
import { SectionLabel } from "./ui.tsx";

const selectPlan = (state: State) => state.server?.plan ?? null;
const selectTasks = (state: State) => state.server?.tasks;

/** The coach's focus plan: blocks in order, sized by their minutes. */
export function PlanCard() {
  const plan = useAppState(selectPlan);
  const tasks = useAppState(selectTasks) ?? [];
  if (!plan || plan.blocks.length === 0) return null;
  const total = plan.blocks.reduce((sum, block) => sum + block.minutes, 0);
  let start = 0;

  return (
    <section
      aria-labelledby="plan-heading"
      className="border-vitask-border bg-vitask-surface rounded-md border px-4 py-3"
    >
      <div className="mb-2.5 flex items-center gap-2">
        <CalendarClock aria-hidden="true" className="text-vitask-accent" size={14} />
        <SectionLabel id="plan-heading">focus plan</SectionLabel>
        <span className="font-vitask-mono text-vitask-text-tertiary ml-auto text-[11px]">
          {fmtMinutes(total)} · made {clockTime(plan.createdAt)}
        </span>
      </div>
      <div aria-hidden="true" className="mb-3 flex h-1.5 gap-0.5 overflow-hidden rounded-sm">
        {plan.blocks.map((block, index) => (
          <span
            className={index % 2 === 0 ? "bg-vitask-accent/70" : "bg-vitask-teal/70"}
            key={`${block.taskId}-${index}`}
            style={{ flexGrow: block.minutes }}
          />
        ))}
      </div>
      <ol className="flex flex-col gap-1.5">
        {plan.blocks.map((block, index) => {
          const offset = start;
          start += block.minutes;
          const done = tasks.find((task) => task.id === block.taskId)?.status === "done";
          return (
            <li className="flex items-baseline gap-3 text-[13px]" key={`${block.taskId}-${index}`}>
              <span className="font-vitask-mono text-vitask-text-tertiary w-14 shrink-0 text-[11px] tabular-nums">
                {offset === 0 ? "now" : `+${fmtMinutes(offset)}`}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={
                    done ? "text-vitask-text-tertiary line-through" : "text-vitask-text-primary"
                  }
                >
                  {block.title}
                </span>
                {block.note ? (
                  <span className="text-vitask-text-tertiary block text-xs">{block.note}</span>
                ) : null}
              </span>
              <span className="font-vitask-mono text-vitask-text-secondary shrink-0 text-[11px] tabular-nums">
                {fmtMinutes(block.minutes)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
