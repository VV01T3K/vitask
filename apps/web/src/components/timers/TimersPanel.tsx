import type { CareTimer } from "@vitask/protocol";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useAlarm } from "../../hooks/useAlarm.ts";
import { useNow } from "../../hooks/useNow.ts";
import { describeError } from "../../lib/errors.ts";
import { useActions, useAppState } from "../../state/client.tsx";
import type { State } from "../../state/types.ts";
import { viewTimers } from "../../state/view.ts";
import { SectionLabel } from "../ui.tsx";
import { TimerCard } from "./TimerCard.tsx";
import { TimerModal } from "./TimerModal.tsx";

const selectOps = (state: State) => state.ops;
const selectServer = (state: State) => state.server;
const selectFiring = (state: State) => state.firing;
const selectOffset = (state: State) => state.clockOffsetMs;

export function TimersPanel() {
  const actions = useActions();
  const ops = useAppState(selectOps);
  const server = useAppState(selectServer);
  const firing = useAppState(selectFiring);
  const offset = useAppState(selectOffset);
  const now = useNow(1000, offset);
  const timers = useMemo(() => viewTimers({ ops, server }), [ops, server]);
  const [editing, setEditing] = useState<CareTimer | "new" | null>(null);
  const sessionActive = server?.session?.status === "active";
  const alarmTimerId = timers.find((timer) => firing[timer.id])?.id ?? null;
  useAlarm(alarmTimerId !== null);

  return (
    <section aria-labelledby="timers-heading" className="flex min-w-0 flex-col gap-3">
      <SectionLabel id="timers-heading">care timers</SectionLabel>
      <div className="flex min-w-0 flex-col gap-2">
        {timers.map((timer) => (
          <TimerCard
            alarm={timer.id === alarmTimerId}
            key={timer.id}
            now={now}
            nudge={firing[timer.id]}
            onDelete={() => void actions.deleteTimer(timer.id)}
            onDone={() => actions.dismissNudge(timer.id)}
            onEdit={() => setEditing(timer)}
            onToggle={(enabled) =>
              void actions.updateTimer(timer.id, { enabled }).then((error) => {
                if (error) toast.error(describeError(error));
              })
            }
            sessionActive={sessionActive}
            timer={timer}
          />
        ))}
        <button
          className="border-vitask-border text-vitask-text-tertiary hover:border-vitask-border-bright hover:text-vitask-accent hover:bg-vitask-accent/5 flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed bg-transparent px-3 py-5 transition hover:border-solid"
          onClick={() => setEditing("new")}
          type="button"
        >
          <Plus aria-hidden="true" size={20} strokeWidth={1.5} />
          <span className="text-[11px] tracking-[0.08em] uppercase">add timer</span>
        </button>
      </div>
      {editing !== null ? (
        <TimerModal
          onClose={() => setEditing(null)}
          timer={editing === "new" ? undefined : editing}
        />
      ) : null}
    </section>
  );
}
