import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { api, model } from "@vitask/backend-api";
import { Loader2, Plus, Sparkle, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { CreateTimerModal } from "../components/vitask/CreateTimerModal";
import { TaskItem } from "../components/vitask/TaskItem";
import { TimerCard } from "../components/vitask/TimerCard";
import { useTimerAlerts } from "../components/vitask/useTimerAlerts";
import {
  createRuntime,
  durationSeconds,
  getRemainingSeconds,
  syncRuntimesWithTimers,
  type Runtimes,
} from "../components/vitask/vitask.data";
import { accentFor } from "../components/vitask/vitask.helpers";
import { WrapUpModal } from "../components/vitask/WrapUpModal";
import { getSessionSnapshotFn } from "../integrations/tanstack/ai/session.functions";
import {
  generateTaskHypeFn,
  generateTimerNudgeFn,
  generateWrapUpFn,
} from "../integrations/tanstack/ai/vitask.functions";
import { useAppForm } from "../integrations/tanstack/form";

const taskFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(
        model.createTaskRequestTitleMin,
        `Task titles must be at least ${model.createTaskRequestTitleMin} characters.`,
      )
      .max(
        model.createTaskRequestTitleMax,
        `Task titles must be at most ${model.createTaskRequestTitleMax} characters.`,
      ),
  })
  .transform((value): z.input<typeof model.CreateTaskRequest> => value)
  .pipe(model.CreateTaskRequest);

type TaskFormValues = z.input<typeof taskFormSchema>;
type TaskResponse = model.TaskResponse;
type TimerResponse = model.TimerResponse;

export const Route = createFileRoute("/")({
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(api.getListTasksSuspenseQueryOptions()),
      queryClient.ensureQueryData(api.getListTimersSuspenseQueryOptions()),
      getSessionSnapshotFn(),
    ]),
  component: Dashboard,
});

function isTimerPageActive() {
  return document.visibilityState === "visible" && document.hasFocus();
}

function Dashboard() {
  const { queryClient } = useRouteContext({ from: "/" });
  const { data: tasksResponse } = api.useListTasksSuspense();
  const { data: timersResponse } = api.useListTimersSuspense();
  const [, , sessionSnapshot] = Route.useLoaderData();
  const createTask = api.useCreateTask();
  const createTimer = api.useCreateTimer();
  const deleteTask = api.useDeleteTask();
  const setTaskCompletion = api.useSetTaskCompletion();
  const generateTaskHype = useServerFn(generateTaskHypeFn);
  const generateTimerNudge = useServerFn(generateTimerNudgeFn);
  const generateWrapUp = useServerFn(generateWrapUpFn);

  const tasks = tasksResponse.data;
  const timers = timersResponse.data;

  const [runtimes, setRuntimes] = useState<Runtimes>({});
  const [now, setNow] = useState(() => Date.now());
  const [showCreateTimer, setShowCreateTimer] = useState(false);
  const [showWrapUp, setShowWrapUp] = useState(false);
  const [wrapText, setWrapText] = useState("");
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [firedCount, setFiredCount] = useState(0);
  const [snoozedCount, setSnoozedCount] = useState(0);
  const [taskHypeById, setTaskHypeById] = useState<Record<string, string>>(() => ({
    ...sessionSnapshot.taskHypes,
  }));
  const sessionStartRef = useRef(Date.now());
  const [pageActive, setPageActive] = useState(() =>
    typeof document === "undefined" ? true : isTimerPageActive(),
  );
  const { activeOwnerId, play: playAlert, stop: stopAlert } = useTimerAlerts();

  useEffect(() => {
    setRuntimes((previous) => syncRuntimesWithTimers(previous, timers));
  }, [timers]);

  useEffect(() => {
    const nudges = sessionSnapshot.timerNudges;
    if (Object.keys(nudges).length === 0) return;
    setRuntimes((prev) => {
      const next = { ...prev };
      for (const [timerId, message] of Object.entries(nudges)) {
        if (next[timerId]) next[timerId] = { ...next[timerId], message };
      }
      return next;
    });
  }, [sessionSnapshot]);

  useEffect(() => {
    const syncClock = () => {
      setNow(Date.now());
      setPageActive(isTimerPageActive());
    };

    const id = window.setInterval(syncClock, 1000);
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

    const completedTaskCount = tasks.filter((task) => task.isCompleted).length;
    const expiredTimers = timers.filter((timer) => {
      const runtime = runtimes[timer.id] ?? createRuntime(durationSeconds(timer));
      return !runtime.firing && runtime.nextFireAt <= now;
    });

    if (expiredTimers.length === 0) return;

    setRuntimes((previous) => {
      let changed = false;
      const next: Runtimes = { ...previous };

      for (const timer of expiredTimers) {
        const current = next[timer.id] ?? createRuntime(durationSeconds(timer));
        if (current.firing || current.nextFireAt > now) continue;

        next[timer.id] = {
          ...current,
          firing: true,
          message: "...",
        };
        changed = true;
      }

      return changed ? next : previous;
    });

    setFiredCount((count) => count + expiredTimers.length);

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

          return {
            ...previous,
            [timer.id]: {
              ...current,
              message,
            },
          };
        });
      });
    }
  }, [generateTimerNudge, now, pageActive, runtimes, tasks, timers]);

  const addTask = useCallback(
    async (value: TaskFormValues) => {
      try {
        const response = await createTask.mutateAsync({
          data: value,
        });

        setJustAddedId(response.data.id);
        window.setTimeout(() => {
          setJustAddedId((current) => (current === response.data.id ? null : current));
        }, 400);

        await queryClient.invalidateQueries({ queryKey: api.getListTasksQueryKey() });
        return null;
      } catch (error) {
        return getErrorMessage(error, "The backend could not create the task.");
      }
    },
    [createTask, queryClient],
  );

  const completeTask = useCallback(
    async (id: string) => {
      try {
        const response = await setTaskCompletion.mutateAsync({
          id,
          data: {
            isCompleted: true,
          },
        });

        const hype = await generateTaskHype({
          data: {
            title: response.data.title,
            taskId: id,
            taskTitle: response.data.title,
          },
        });

        setTaskHypeById((previous) => ({
          ...previous,
          [id]: hype,
        }));

        toast.custom(
          (toastId) => (
            <TaskHypeToast message={hype} taskTitle={response.data.title} toastId={toastId} />
          ),
          { duration: 5000 },
        );

        await queryClient.invalidateQueries({ queryKey: api.getListTasksQueryKey() });
      } catch (error) {
        toast.error(getErrorMessage(error, "The backend could not update the task."));
      }
    },
    [generateTaskHype, queryClient, setTaskCompletion],
  );

  const uncompleteTask = useCallback(
    async (id: string) => {
      try {
        await setTaskCompletion.mutateAsync({
          id,
          data: {
            isCompleted: false,
          },
        });

        setTaskHypeById((previous) => {
          if (!(id in previous)) return previous;

          const next = { ...previous };
          delete next[id];
          return next;
        });

        await queryClient.invalidateQueries({ queryKey: api.getListTasksQueryKey() });
      } catch (error) {
        toast.error(getErrorMessage(error, "The backend could not update the task."));
      }
    },
    [queryClient, setTaskCompletion],
  );

  const removeTask = useCallback(
    async (id: string) => {
      try {
        await deleteTask.mutateAsync({ id });

        setTaskHypeById((previous) => {
          if (!(id in previous)) return previous;

          const next = { ...previous };
          delete next[id];
          return next;
        });

        await queryClient.invalidateQueries({ queryKey: api.getListTasksQueryKey() });
      } catch (error) {
        toast.error(getErrorMessage(error, "The backend could not delete the task."));
      }
    },
    [deleteTask, queryClient],
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

          return {
            ...previous,
            [id]: {
              ...current,
              sweeping: false,
            },
          };
        });
      }, 600);
    },
    [stopAlert, timers],
  );

  const snoozeTimer = useCallback(
    (id: string, seconds: number) => {
      stopAlert(id);
      setRuntimes((previous) => ({
        ...previous,
        [id]: {
          nextFireAt: Date.now() + seconds * 1000,
          firing: false,
          message: null,
        },
      }));
      setSnoozedCount((count) => count + 1);
    },
    [stopAlert],
  );

  const handleCreateTimer = useCallback(
    async ({
      title,
      description,
      durationSeconds: nextDurationSeconds,
      aiInstructions,
    }: {
      title: string;
      description: string;
      durationSeconds: number;
      aiInstructions: string;
    }) => {
      try {
        const response = await createTimer.mutateAsync({
          data: {
            title,
            description,
            durationSeconds: nextDurationSeconds,
            aiInstructions,
          },
        });

        setRuntimes((previous) => ({
          ...previous,
          [response.data.id]: createRuntime(Number(response.data.durationSeconds)),
        }));

        await queryClient.invalidateQueries({ queryKey: api.getListTimersQueryKey() });
        return true;
      } catch (error) {
        toast.error(getErrorMessage(error, "The backend could not create the timer."));
        return false;
      }
    },
    [createTimer, queryClient],
  );

  const handleWrapUp = useCallback(async () => {
    setShowWrapUp(true);
    setWrapText("...");

    const minutes = Math.floor((now - sessionStartRef.current) / 60000);
    const text = await generateWrapUp({
      data: {
        firedCount,
        snoozedCount,
        minutes,
        tasks: tasks.map((t) => ({ title: t.title, isCompleted: t.isCompleted })),
        timers: timers.map((t) => ({ title: t.title, description: t.description })),
      },
    });

    setWrapText(text);
  }, [firedCount, generateWrapUp, now, snoozedCount, tasks, timers]);

  const firingAlarmTimer = timers.find((timer) => runtimes[timer.id]?.firing);

  useEffect(() => {
    if (!firingAlarmTimer || !pageActive) {
      stopAlert();
      return;
    }

    void playAlert(firingAlarmTimer.id);
  }, [firingAlarmTimer, pageActive, playAlert, stopAlert]);

  const minutes = Math.floor((now - sessionStartRef.current) / 60000);
  const activeTasks = tasks.filter((task) => !task.isCompleted);
  const completedTasks = [...tasks]
    .filter((task) => task.isCompleted)
    .sort((left, right) => {
      const leftTime = left.completedAt ? new Date(left.completedAt).getTime() : 0;
      const rightTime = right.completedAt ? new Date(right.completedAt).getTime() : 0;
      return rightTime - leftTime;
    });

  return (
    <div className="vitask-surface font-vitask-body text-vitask-text-primary min-h-screen">
      <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 p-6">
        <section className="border-vitask-border bg-vitask-surface flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3">
          <div className="flex items-center gap-4">
            <span className="font-vitask-mono text-vitask-text-tertiary text-[11px] tracking-[0.12em] uppercase">
              live session
            </span>
            <span className="text-vitask-text-secondary text-sm">{activeTasks.length} active</span>
            <span className="text-vitask-text-secondary text-sm">
              {completedTasks.length} completed
            </span>
            <span className="text-vitask-text-secondary text-sm">{minutes} min</span>
          </div>
          <button
            className="border-vitask-border text-vitask-text-secondary hover:border-vitask-border-bright hover:bg-vitask-surface hover:text-vitask-text-primary inline-flex items-center gap-2 rounded border bg-transparent px-3.5 py-1.5 text-[13px] font-medium transition"
            onClick={() => {
              void handleWrapUp();
            }}
            type="button"
          >
            Wrap up session <Sparkle aria-hidden="true" className="text-vitask-teal" size={12} />
          </button>
        </section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
          <TasksPanel
            disabled={createTask.isPending || setTaskCompletion.isPending || deleteTask.isPending}
            justAddedId={justAddedId}
            onAdd={addTask}
            onComplete={completeTask}
            onDelete={removeTask}
            onUncomplete={uncompleteTask}
            taskHypeById={taskHypeById}
            tasks={tasks}
          />
          <TimersPanel
            activeAlarmId={activeOwnerId}
            now={now}
            onAdd={() => setShowCreateTimer(true)}
            onFireDone={fireDone}
            onSnooze={snoozeTimer}
            runtimes={runtimes}
            timers={timers}
          />
        </div>
      </main>

      <CreateTimerModal
        activeTaskTitles={activeTasks.map((task) => task.title)}
        errorMessage={
          createTimer.error
            ? getErrorMessage(createTimer.error, "The timer could not be created.")
            : null
        }
        isSubmitting={createTimer.isPending}
        onClose={() => setShowCreateTimer(false)}
        onCreate={handleCreateTimer}
        open={showCreateTimer}
      />
      <WrapUpModal
        debriefText={wrapText}
        onClose={() => {
          setShowWrapUp(false);
          setWrapText("");
          setTaskHypeById({});
          setFiredCount(0);
          setSnoozedCount(0);
          sessionStartRef.current = Date.now();
        }}
        open={showWrapUp}
        stats={{
          tasks: completedTasks.length,
          fired: firedCount,
          snoozed: snoozedCount,
          minutes,
        }}
      />
    </div>
  );
}

function TaskHypeToast({
  taskTitle,
  message,
  toastId,
}: {
  taskTitle: string;
  message: string;
  toastId: string | number;
}) {
  return (
    <div className="vitask-hype-toast">
      <div className="vitask-hype-toast-body">
        <div className="vitask-hype-toast-header">
          <span className="text-vitask-teal font-vitask-mono inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold tracking-[0.12em] uppercase">
            <Sparkle aria-hidden="true" size={9} strokeWidth={2.5} />
            AI
          </span>
          <span className="text-vitask-text-secondary min-w-0 flex-1 truncate text-[11px]">
            {taskTitle}
          </span>
          <button
            aria-label="Dismiss"
            className="vitask-hype-toast-close"
            onClick={() => toast.dismiss(toastId)}
            type="button"
          >
            <X size={11} strokeWidth={2} />
          </button>
        </div>
        <p className="text-vitask-text-primary text-[13px] leading-[1.55]">{message}</p>
      </div>
      <div aria-hidden="true" className="vitask-hype-toast-progress" />
    </div>
  );
}

type TasksPanelProps = {
  tasks: TaskResponse[];
  taskHypeById: Record<string, string>;
  justAddedId: string | null;
  disabled: boolean;
  onAdd: (value: TaskFormValues) => Promise<string | null>;
  onComplete: (id: string) => void;
  onUncomplete: (id: string) => void;
  onDelete: (id: string) => void;
};

function TasksPanel({
  tasks,
  taskHypeById,
  justAddedId,
  disabled,
  onAdd,
  onComplete,
  onUncomplete,
  onDelete,
}: TasksPanelProps) {
  const active = tasks.filter((task) => !task.isCompleted);
  const completed = [...tasks]
    .filter((task) => task.isCompleted)
    .sort((left, right) => {
      const leftTime = left.completedAt ? new Date(left.completedAt).getTime() : 0;
      const rightTime = right.completedAt ? new Date(right.completedAt).getTime() : 0;
      return rightTime - leftTime;
    });

  return (
    <section className="flex min-h-0 flex-col gap-3">
      <div className="text-vitask-text-tertiary mb-1 flex items-center justify-between text-[11px] font-medium tracking-[0.08em] uppercase">
        <span>in flight</span>
      </div>

      <AddTaskInput disabled={disabled} onAdd={onAdd} />

      <ul className="flex flex-col gap-0.5">
        {active.length === 0 && completed.length === 0 ? (
          <li className="font-vitask-mono text-vitask-text-tertiary px-3 py-8 text-center text-[13px]">
            // no tasks. type something above.
          </li>
        ) : null}

        {active.map((task) => (
          <TaskItem
            hype={taskHypeById[task.id] ?? null}
            isEntering={task.id === justAddedId}
            key={task.id}
            onComplete={onComplete}
            onDelete={onDelete}
            onUncomplete={onUncomplete}
            task={task}
          />
        ))}

        {completed.length > 0 ? (
          <li>
            <div className="mt-4 mb-1.5 flex items-center gap-3 px-3">
              <div className="bg-vitask-border h-px flex-1" />
              <span className="text-vitask-text-tertiary text-[10px] tracking-[0.12em] uppercase">
                completed
              </span>
              <div className="bg-vitask-border h-px flex-1" />
            </div>
          </li>
        ) : null}

        {completed.map((task) => (
          <TaskItem
            hype={taskHypeById[task.id] ?? null}
            key={task.id}
            onComplete={onComplete}
            onDelete={onDelete}
            onUncomplete={onUncomplete}
            task={task}
          />
        ))}
      </ul>
    </section>
  );
}

function AddTaskInput({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (value: TaskFormValues) => Promise<string | null>;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useAppForm({
    defaultValues: {
      title: "",
    } as TaskFormValues,
    validators: {
      onChange: taskFormSchema,
      onSubmit: taskFormSchema,
    },
    onSubmit: async ({ value, formApi }) => {
      if (disabled) return;

      const parsedTask = model.CreateTaskRequest.safeParse(value);
      if (!parsedTask.success) return;

      const nextError = await onAdd(parsedTask.data);

      if (nextError) {
        setServerError(nextError);
        return;
      }

      setServerError(null);
      formApi.reset();
    },
  });

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit().catch((error: unknown) => {
          console.error("Unable to create task", error);
        });
      }}
    >
      <form.AppField name="title">
        {(field) => {
          const errors = getFieldErrorMessages(field.state.meta.errors);
          const showErrors = field.state.meta.isTouched && errors.length > 0;

          return (
            <>
              <form.Subscribe selector={(state) => ({ isSubmitting: state.isSubmitting })}>
                {({ isSubmitting }) => (
                  <div className="bg-vitask-elevated border-vitask-border focus-within:border-vitask-accent flex h-11 items-center gap-2.5 rounded-md border px-3.5 transition-colors">
                    <span className="font-vitask-mono text-vitask-text-tertiary text-base select-none">
                      +
                    </span>
                    <input
                      autoFocus
                      className="placeholder:text-vitask-text-tertiary text-vitask-text-primary flex-1 border-none bg-transparent text-sm outline-none disabled:opacity-50"
                      disabled={disabled || isSubmitting}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(event) => {
                        if (serverError) {
                          setServerError(null);
                        }
                        field.handleChange(event.target.value);
                      }}
                      placeholder="What are you working on..."
                      type="text"
                      value={field.state.value}
                    />
                    {disabled || isSubmitting ? (
                      <Loader2 aria-hidden="true" className="animate-spin" size={14} />
                    ) : null}
                  </div>
                )}
              </form.Subscribe>

              {showErrors ? (
                <div className="flex flex-col gap-1 px-1">
                  {errors.map((message, index) => (
                    <p className="text-[11px] text-red-300" key={`${message}-${index}`}>
                      {message}
                    </p>
                  ))}
                </div>
              ) : null}
            </>
          );
        }}
      </form.AppField>

      {serverError ? <p className="px-1 text-[11px] text-red-300">{serverError}</p> : null}
    </form>
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

type TimersPanelProps = {
  timers: TimerResponse[];
  runtimes: Runtimes;
  now: number;
  activeAlarmId: string | null;
  onAdd: () => void;
  onFireDone: (id: string) => void;
  onSnooze: (id: string, seconds: number) => void;
};

function TimersPanel({
  timers,
  runtimes,
  now,
  activeAlarmId,
  onAdd,
  onFireDone,
  onSnooze,
}: TimersPanelProps) {
  return (
    <section className="flex min-h-0 flex-col gap-3">
      <div className="text-vitask-text-tertiary mb-1 text-[11px] font-medium tracking-[0.08em] uppercase">
        timers
      </div>

      <div className="flex flex-col gap-2">
        {timers.map((timer) => (
          <TimerCard
            accentColor={accentFor(timer.title)}
            alarmActive={activeAlarmId === timer.id}
            key={timer.id}
            onFireDone={onFireDone}
            onSnooze={onSnooze}
            remaining={getRemainingSeconds(runtimes[timer.id], durationSeconds(timer), now)}
            runtime={runtimes[timer.id]}
            timer={timer}
          />
        ))}
        <button
          className="border-vitask-border text-vitask-text-tertiary hover:border-vitask-border-bright hover:text-vitask-accent hover:bg-vitask-accent/5 flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed bg-transparent px-3 py-6 transition hover:border-solid"
          onClick={onAdd}
          type="button"
        >
          <Plus aria-hidden="true" className="font-vitask-mono" size={22} strokeWidth={1.5} />
          <span className="text-[11px] tracking-[0.08em] uppercase">add timer</span>
        </button>
      </div>
    </section>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object") {
    const withInfo = error as { info?: { errors?: Record<string, string[]> } };
    const firstError = withInfo.info?.errors
      ? Object.values(withInfo.info.errors).flat()[0]
      : undefined;

    if (firstError) {
      return firstError;
    }
  }

  return fallback;
}
