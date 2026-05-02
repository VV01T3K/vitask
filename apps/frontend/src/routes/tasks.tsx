import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { api, model } from "@vitask/backend-api";
import { CheckSquare, Loader2, Plus } from "lucide-react";
import { Suspense } from "react";
import { z } from "zod";

import { useAppForm } from "#/integrations/tanstack/form";

export const Route = createFileRoute("/tasks")({
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(api.getListTasksSuspenseQueryOptions()),
  component: TasksRoute,
});

function TasksRoute() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-9rem)] w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <section className="space-y-2">
        <p className="text-sm font-medium tracking-[0.18em] text-cyan-700 uppercase dark:text-cyan-300">
          Task management
        </p>
        <h1 className="text-3xl font-semibold text-zinc-950 dark:text-zinc-50">Tasks</h1>
      </section>

      <CreateTaskForm />

      <Suspense fallback={<TaskListSkeleton />}>
        <TaskList />
      </Suspense>
    </main>
  );
}

const taskFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(
        model.createTaskRequestTitleMin,
        `Title must be at least ${model.createTaskRequestTitleMin} characters`,
      )
      .max(
        model.createTaskRequestTitleMax,
        `Title must be at most ${model.createTaskRequestTitleMax} characters`,
      ),
    notes: z.string().optional(),
    dueDate: z.iso.date().optional(),
  })
  .transform((value): z.input<typeof model.CreateTaskRequest> => value)
  .pipe(model.CreateTaskRequest);

function CreateTaskForm() {
  const { queryClient } = useRouteContext({ from: "/tasks" });
  const { isPending, mutate } = api.useCreateTask();

  const form = useAppForm({
    defaultValues: {
      title: "",
      notes: "",
      dueDate: undefined,
    } as z.input<typeof taskFormSchema>,
    validators: {
      onChange: taskFormSchema,
      onSubmit: taskFormSchema,
    },
    onSubmit: ({ value, formApi }) => {
      const parsedTask = model.CreateTaskRequest.safeParse(value);
      if (!parsedTask.success) return;

      mutate(
        { data: parsedTask.data },
        {
          onError: (error) => {
            console.error("Unable to create task", error);
            formApi.setErrorMap({
              onServer: "The backend could not create the task. Please try again.",
            } as never);
          },
          onSuccess: async () => {
            formApi.reset();
            await queryClient.invalidateQueries({ queryKey: api.getListTasksQueryKey() });
          },
        },
      );
    },
  });

  return (
    <form
      className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit().catch((error: unknown) => {
          console.error("Unable to create task", error);
        });
      }}
    >
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">New task</h2>

      <form.AppField name="title">
        {(field) => (
          <field.TextField id="title" label="Title" placeholder="What needs to be done?" required />
        )}
      </form.AppField>

      <div className="grid gap-4 sm:grid-cols-2">
        <form.AppField name="dueDate">
          {(field) => <field.DateField id="dueDate" label="Due date" />}
        </form.AppField>
      </div>

      <form.AppField name="notes">
        {(field) => (
          <field.TextArea
            className="[&>textarea]:min-h-20"
            id="notes"
            label="Notes"
            placeholder="Optional notes..."
          />
        )}
      </form.AppField>

      <div className="flex justify-end">
        <form.AppForm>
          <form.SubscribeButton
            disabled={isPending}
            icon={<Plus aria-hidden="true" size={16} />}
            label="Add task"
            pendingIcon={<Loader2 aria-hidden="true" className="animate-spin" size={16} />}
          />
        </form.AppForm>
      </div>
    </form>
  );
}

function TaskList() {
  const { data } = api.useListTasksSuspense();
  const tasks = data.data;

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-zinc-300 py-16 text-center dark:border-zinc-700">
        <CheckSquare aria-hidden="true" className="text-zinc-400 dark:text-zinc-600" size={32} />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No tasks yet. Create one above.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {tasks.map((task) => (
        <li
          className="flex flex-col gap-1 rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
          key={task.id}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {task.title}
            </span>
            {task.dueDate ? (
              <span className="shrink-0 rounded-full bg-cyan-50 px-2 py-0.5 text-xs font-medium text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
                {task.dueDate}
              </span>
            ) : null}
          </div>
          {task.notes ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{task.notes}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function TaskListSkeleton() {
  return (
    <ul className="flex flex-col gap-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <li
          className="h-12 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
          key={i}
        />
      ))}
    </ul>
  );
}
