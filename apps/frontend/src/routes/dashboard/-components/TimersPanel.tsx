import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { api, type model } from "@vitask/backend-api";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { generateTimerNudgeFn } from "#/functions/timer.functions";
import { useTimerAlerts } from "#/hooks/useTimerAlerts";
import { getBackendErrorMessage } from "#/lib/backendError";
import { normalizeTimerAppearance, type TimerIconKey } from "#/lib/timerAppearance";
import {
  createRuntime,
  durationSeconds,
  getRemainingSeconds,
  syncRuntimesWithTimers,
  type Runtimes,
} from "#/lib/timerRuntime";

import { CreateTimerModal, type TimerSubmitValues } from "./CreateTimerModal";
import { TimerCard } from "./TimerCard";

const TIMER_SWEEP_MS = 600;
const CLOCK_TICK_MS = 1000;

type TimerResponse = model.TimerResponse;

type TimersPanelProps = {
  initialNudges: Record<string, string>;
  onTimerFired: (timers: { id: string; title: string }[]) => void;
  onTimerSnoozed: (timer: { id: string; title: string }) => void;
};

function isTimerPageActive() {
  return document.visibilityState === "visible" && document.hasFocus();
}

export function TimersPanel({ initialNudges, onTimerFired, onTimerSnoozed }: TimersPanelProps) {
  const queryClient = useQueryClient();
  const { data: tasksResponse } = api.useListTasksSuspense();
  const { data: timersResponse } = api.useListTimersSuspense();
  const createTimerMutation = api.useCreateTimer();
  const updateTimerMutation = api.useUpdateTimer();
  const deleteTimerMutation = api.useDeleteTimer();
  const generateTimerNudge = useServerFn(generateTimerNudgeFn);
  const { activeOwnerId, play: playAlert, stop: stopAlert } = useTimerAlerts();

  const tasks = tasksResponse.data;
  const timers = timersResponse.data;

  const completedTaskCount = useMemo(
    () => tasks.filter((task) => task.isCompleted).length,
    [tasks],
  );
  const activeTaskTitles = useMemo(
    () => tasks.filter((task) => !task.isCompleted).map((task) => task.title),
    [tasks],
  );

  const [runtimes, setRuntimes] = useState<Runtimes>({});
  const [now, setNow] = useState(() => Date.now());
  const [pageActive, setPageActive] = useState(() =>
    typeof document === "undefined" ? true : isTimerPageActive(),
  );
  const [showCreate, setShowCreate] = useState(false);
  const [editingTimer, setEditingTimer] = useState<TimerResponse | null>(null);

  useEffect(() => {
    setRuntimes((previous) => syncRuntimesWithTimers(previous, timers));
  }, [timers]);

  useEffect(() => {
    if (Object.keys(initialNudges).length === 0) return;
    setRuntimes((previous) => {
      const next = { ...previous };
      for (const [timerId, message] of Object.entries(initialNudges)) {
        if (next[timerId]) next[timerId] = { ...next[timerId], message };
      }
      return next;
    });
  }, [initialNudges]);

  useEffect(() => {
    const syncClock = () => {
      setNow(Date.now());
      setPageActive(isTimerPageActive());
    };

    const id = window.setInterval(syncClock, CLOCK_TICK_MS);
    window.addEventListener("focus", syncClock);
    window.addEventListener("blur", syncClock);
    document.addEventListener("visibilitychange", syncClock);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", syncClock);
      window.removeEventListener("blur", syncClock);
      document.removeEventListener("visibilitychange", syncClock);
    };
  }, []);

  useEffect(() => {
    if (!pageActive) return;

    const expiredTimers = timers.filter((timer) => {
      const runtime = runtimes[timer.id] ?? createRuntime(durationSeconds(timer));
      return !runtime.firing && runtime.nextFireAt - now < 100;
    });

    if (expiredTimers.length === 0) return;

    setRuntimes((previous) => {
      let changed = false;
      const next: Runtimes = { ...previous };

      for (const timer of expiredTimers) {
        const current = next[timer.id] ?? createRuntime(durationSeconds(timer));
        if (current.firing || current.nextFireAt - now >= 100) continue;

        next[timer.id] = { ...current, firing: true, message: "..." };
        changed = true;
      }

      return changed ? next : previous;
    });

    onTimerFired(expiredTimers.map((t) => ({ id: t.id, title: t.title })));

    for (const timer of expiredTimers) {
      void generateTimerNudge({
        data: {
          timerId: timer.id,
          timerTitle: timer.title,
          timerDescription: timer.description,
          aiInstructions: timer.aiInstructions,
          completedTaskCount,
        },
      }).then((message) => {
        setRuntimes((previous) => {
          const current = previous[timer.id];
          if (!current?.firing) return previous;
          return { ...previous, [timer.id]: { ...current, message } };
        });
      });
    }
  }, [completedTaskCount, generateTimerNudge, now, onTimerFired, pageActive, runtimes, timers]);

  const firingAlarmTimer = timers.find((timer) => runtimes[timer.id]?.firing);

  useEffect(() => {
    if (!firingAlarmTimer || !pageActive) {
      stopAlert();
      return;
    }
    void playAlert(firingAlarmTimer.id);
  }, [firingAlarmTimer, pageActive, playAlert, stopAlert]);

  const invalidateTimers = useCallback(
    () => queryClient.invalidateQueries({ queryKey: api.getListTimersQueryKey() }),
    [queryClient],
  );

  const submitCreate = useCallback(
    async ({
      title,
      description,
      durationSeconds: nextDurationSeconds,
      aiInstructions,
      appearance,
    }: TimerSubmitValues) => {
      try {
        const response = await createTimerMutation.mutateAsync({
          data: {
            title,
            description,
            durationSeconds: nextDurationSeconds,
            aiInstructions,
            icon: appearance.icon,
            color: appearance.color,
          },
        });

        setRuntimes((previous) => ({
          ...previous,
          [response.data.id]: createRuntime(Number(response.data.durationSeconds)),
        }));

        await invalidateTimers();
        return true;
      } catch (error) {
        toast.error(getBackendErrorMessage(error, "The backend could not create the timer."));
        return false;
      }
    },
    [createTimerMutation, invalidateTimers],
  );

  const submitEdit = useCallback(
    async ({
      title,
      description,
      durationSeconds: nextDurationSeconds,
      aiInstructions,
      appearance,
    }: TimerSubmitValues) => {
      if (!editingTimer) return false;
      const durationChanged = durationSeconds(editingTimer) !== nextDurationSeconds;
      try {
        await updateTimerMutation.mutateAsync({
          id: editingTimer.id,
          data: {
            title,
            description,
            durationSeconds: nextDurationSeconds,
            aiInstructions,
            icon: appearance.icon,
            color: appearance.color,
          },
        });
        if (durationChanged) {
          setRuntimes((previous) => ({
            ...previous,
            [editingTimer.id]: createRuntime(nextDurationSeconds),
          }));
        }
        await invalidateTimers();
        return true;
      } catch (error) {
        toast.error(getBackendErrorMessage(error, "The backend could not update the timer."));
        return false;
      }
    },
    [editingTimer, invalidateTimers, updateTimerMutation],
  );

  const removeTimer = useCallback(
    async (id: string) => {
      try {
        await deleteTimerMutation.mutateAsync({ id });
        await invalidateTimers();
      } catch (error) {
        toast.error(getBackendErrorMessage(error, "The backend could not delete the timer."));
      }
    },
    [deleteTimerMutation, invalidateTimers],
  );

  const fireDone = useCallback(
    (id: string) => {
      const timer = timers.find((item) => item.id === id);
      if (!timer) return;

      stopAlert(id);
      setRuntimes((previous) => ({
        ...previous,
        [id]: {
          nextFireAt: Date.now() + durationSeconds(timer) * 1000,
          firing: false,
          message: null,
          sweeping: true,
        },
      }));

      window.setTimeout(() => {
        setRuntimes((previous) => {
          const current = previous[id];
          if (!current) return previous;
          return { ...previous, [id]: { ...current, sweeping: false } };
        });
      }, TIMER_SWEEP_MS);
    },
    [stopAlert, timers],
  );

  const snoozeTimer = useCallback(
    (id: string, seconds: number) => {
      const timer = timers.find((t) => t.id === id);
      stopAlert(id);
      setRuntimes((previous) => ({
        ...previous,
        [id]: {
          nextFireAt: Date.now() + seconds * 1000,
          firing: false,
          message: null,
        },
      }));
      if (timer) {
        onTimerSnoozed({ id: timer.id, title: timer.title });
      }
    },
    [onTimerSnoozed, stopAlert, timers],
  );

  const createError = createTimerMutation.error
    ? getBackendErrorMessage(createTimerMutation.error, "The timer could not be created.")
    : null;
  const updateError = updateTimerMutation.error
    ? getBackendErrorMessage(updateTimerMutation.error, "The timer could not be updated.")
    : null;

  return (
    <>
      <section className="flex min-h-0 min-w-0 flex-col gap-3">
        <div className="text-vitask-text-tertiary mb-1 text-[11px] font-medium tracking-[0.08em] uppercase">
          care timers
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          {timers.map((timer) => (
            <TimerCard
              alarmActive={activeOwnerId === timer.id}
              appearance={normalizeTimerAppearance({
                icon: timer.icon as TimerIconKey,
                color: timer.color,
              })}
              key={timer.id}
              onDelete={removeTimer}
              onEdit={setEditingTimer}
              onFireDone={fireDone}
              onSnooze={snoozeTimer}
              remaining={getRemainingSeconds(runtimes[timer.id], durationSeconds(timer), now)}
              runtime={runtimes[timer.id]}
              timer={timer}
            />
          ))}
          <button
            className="border-vitask-border text-vitask-text-tertiary hover:border-vitask-border-bright hover:text-vitask-accent hover:bg-vitask-accent/5 flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed bg-transparent px-3 py-6 transition hover:border-solid"
            onClick={() => setShowCreate(true)}
            type="button"
          >
            <Plus aria-hidden="true" className="font-vitask-mono" size={22} strokeWidth={1.5} />
            <span className="text-[11px] tracking-[0.08em] uppercase">add timer</span>
          </button>
        </div>
      </section>

      <CreateTimerModal
        activeTaskTitles={activeTaskTitles}
        errorMessage={createError}
        isSubmitting={createTimerMutation.isPending}
        onClose={() => setShowCreate(false)}
        onSubmit={submitCreate}
        open={showCreate}
      />
      <CreateTimerModal
        activeTaskTitles={activeTaskTitles}
        errorMessage={updateError}
        isSubmitting={updateTimerMutation.isPending}
        onClose={() => setEditingTimer(null)}
        onSubmit={submitEdit}
        open={editingTimer !== null}
        timer={editingTimer ?? undefined}
      />
    </>
  );
}
