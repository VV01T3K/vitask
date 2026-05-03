import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { api } from "@vitask/backend-api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { generateTaskHypeFn } from "#/functions/task.functions";
import { getBackendErrorMessage } from "#/lib/backendError";

import { AddTaskInput, type TaskFormValues } from "./AddTaskInput";
import { TaskHypeToast } from "./TaskHypeToast";
import { TaskItem } from "./TaskItem";

const JUST_ADDED_FLASH_MS = 400;
const HYPE_TOAST_MS = 5000;

type TasksPanelProps = {
  initialHypes: Record<string, string>;
  sessionStartedAt: number;
};

export function TasksPanel({ initialHypes, sessionStartedAt }: TasksPanelProps) {
  const queryClient = useQueryClient();
  const { data: tasksResponse } = api.useListTasksSuspense();
  const createTask = api.useCreateTask();
  const deleteTask = api.useDeleteTask();
  const setTaskCompletion = api.useSetTaskCompletion();
  const generateTaskHype = useServerFn(generateTaskHypeFn);

  const tasks = tasksResponse.data;

  const [taskHypeById, setTaskHypeById] = useState<Record<string, string>>(() => ({
    ...initialHypes,
  }));
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const lastSessionStartRef = useRef(sessionStartedAt);
  useEffect(() => {
    if (sessionStartedAt === lastSessionStartRef.current) return;
    lastSessionStartRef.current = sessionStartedAt;
    setTaskHypeById({});
  }, [sessionStartedAt]);

  const activeTasks = useMemo(() => tasks.filter((task) => !task.isCompleted), [tasks]);
  const completedTasks = useMemo(
    () =>
      [...tasks]
        .filter((task) => task.isCompleted)
        .sort((left, right) => {
          const leftTime = left.completedAt ? new Date(left.completedAt).getTime() : 0;
          const rightTime = right.completedAt ? new Date(right.completedAt).getTime() : 0;
          return rightTime - leftTime;
        }),
    [tasks],
  );

  const isMutating = createTask.isPending || setTaskCompletion.isPending || deleteTask.isPending;

  const invalidateTasks = useCallback(
    () => queryClient.invalidateQueries({ queryKey: api.getListTasksQueryKey() }),
    [queryClient],
  );

  const forgetHype = useCallback((id: string) => {
    setTaskHypeById((previous) => {
      if (!(id in previous)) return previous;
      const next = { ...previous };
      delete next[id];
      return next;
    });
  }, []);

  const addTask = useCallback(
    async (value: TaskFormValues) => {
      try {
        const response = await createTask.mutateAsync({ data: value });

        setJustAddedId(response.data.id);
        window.setTimeout(() => {
          setJustAddedId((current) => (current === response.data.id ? null : current));
        }, JUST_ADDED_FLASH_MS);

        await invalidateTasks();
        return null;
      } catch (error) {
        return getBackendErrorMessage(error, "The backend could not create the task.");
      }
    },
    [createTask, invalidateTasks],
  );

  const completeTask = useCallback(
    async (id: string) => {
      try {
        const response = await setTaskCompletion.mutateAsync({
          id,
          data: { isCompleted: true },
        });

        await invalidateTasks();

        void generateTaskHype({
          data: {
            title: response.data.title,
            taskId: id,
            taskTitle: response.data.title,
          },
        }).then((hype: string) => {
          setTaskHypeById((previous) => ({ ...previous, [id]: hype }));
          toast.custom(
            (toastId) => (
              <TaskHypeToast message={hype} taskTitle={response.data.title} toastId={toastId} />
            ),
            { duration: HYPE_TOAST_MS },
          );
        });
      } catch (error) {
        toast.error(getBackendErrorMessage(error, "The backend could not update the task."));
      }
    },
    [generateTaskHype, invalidateTasks, setTaskCompletion],
  );

  const uncompleteTask = useCallback(
    async (id: string) => {
      try {
        await setTaskCompletion.mutateAsync({ id, data: { isCompleted: false } });
        forgetHype(id);
        await invalidateTasks();
      } catch (error) {
        toast.error(getBackendErrorMessage(error, "The backend could not update the task."));
      }
    },
    [forgetHype, invalidateTasks, setTaskCompletion],
  );

  const removeTask = useCallback(
    async (id: string) => {
      try {
        await deleteTask.mutateAsync({ id });
        forgetHype(id);
        await invalidateTasks();
      } catch (error) {
        toast.error(getBackendErrorMessage(error, "The backend could not delete the task."));
      }
    },
    [deleteTask, forgetHype, invalidateTasks],
  );

  return (
    <section className="flex min-h-0 flex-col gap-3">
      <div className="text-vitask-text-tertiary mb-1 flex items-center justify-between text-[11px] font-medium tracking-[0.08em] uppercase">
        <span>in flight</span>
      </div>

      <AddTaskInput disabled={isMutating} onAdd={addTask} />

      <ul className="flex flex-col gap-0.5">
        {activeTasks.length === 0 && completedTasks.length === 0 ? (
          <li className="font-vitask-mono text-vitask-text-tertiary px-3 py-8 text-center text-[13px]">
            // no tasks. type something above.
          </li>
        ) : null}

        {activeTasks.map((task) => (
          <TaskItem
            hype={taskHypeById[task.id] ?? null}
            isEntering={task.id === justAddedId}
            key={task.id}
            onComplete={completeTask}
            onDelete={removeTask}
            onUncomplete={uncompleteTask}
            task={task}
          />
        ))}

        {completedTasks.length > 0 ? (
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

        {completedTasks.map((task) => (
          <TaskItem
            hype={taskHypeById[task.id] ?? null}
            key={task.id}
            onComplete={completeTask}
            onDelete={removeTask}
            onUncomplete={uncompleteTask}
            task={task}
          />
        ))}
      </ul>
    </section>
  );
}
