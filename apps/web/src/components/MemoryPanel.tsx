import { Brain } from "lucide-react";

import { useNow } from "../hooks/useNow.ts";
import { relTime } from "../lib/format.ts";
import { useAppState } from "../state/client.tsx";
import type { State } from "../state/types.ts";
import { SectionLabel } from "./ui.tsx";

const selectMemory = (state: State) => state.server?.memory;

/** What the coach keeps between conversations, written with its `remember` tool. */
export function MemoryPanel() {
  const memory = useAppState(selectMemory) ?? [];
  const now = useNow(60_000);
  return (
    <section aria-labelledby="memory-heading" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <SectionLabel id="memory-heading">the coach remembers</SectionLabel>
        <Brain aria-hidden="true" className="text-vitask-text-tertiary" size={12} />
      </div>
      {memory.length === 0 ? (
        <p className="font-vitask-mono text-vitask-text-tertiary text-[12px]">
          // nothing yet. tell it what helps you focus.
        </p>
      ) : (
        <ul className="border-vitask-border bg-vitask-surface divide-vitask-border flex flex-col divide-y rounded-md border">
          {[...memory].reverse().map((fact) => (
            <li className="flex items-baseline gap-3 px-3 py-2" key={fact.id}>
              <span className="text-vitask-text-secondary min-w-0 flex-1 text-[13px] leading-snug">
                {fact.text}
              </span>
              <span className="text-vitask-text-tertiary shrink-0 text-[11px]">
                {relTime(fact.createdAt, now)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
