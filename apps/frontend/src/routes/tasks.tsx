import { useForm } from "@tanstack/react-form";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import {
  getListTasksQueryKey,
  getListTasksSuspenseQueryOptions,
  useCreateTask,
  useListTasksSuspense,
} from "@vitask/backend-api/query";
import { CheckSquare, Loader2, Plus } from "lucide-react";
import { Suspense } from "react";

export const Route = createFileRoute("/tasks")({
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(getListTasksSuspenseQueryOptions()),
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

function CreateTaskForm() {
  const { queryClient } = useRouteContext({ from: "/tasks" });
  const { mutateAsync } = useCreateTask();

  const form = useForm({
    defaultValues: { title: "", notes: "", dueDate: "" },
    onSubmit: async ({ value, formApi }) => {
      const result = await mutateAsync({
        data: {
          title: value.title,
          notes: value.notes || undefined,
          dueDate: value.dueDate || undefined,
        },
      });

      if (result.status === 400) {
        const errors = result.data.errors ?? {};
        for (const [key, messages] of Object.entries(errors)) {
          const fieldName = (key.charAt(0).toLowerCase() + key.slice(1)) as keyof typeof value;
          formApi.setFieldMeta(fieldName, (meta) => ({
            ...meta,
            errorMap: { ...meta.errorMap, onServer: messages[0] },
          }));
        }
        return;
      }

      formApi.reset();
      await queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
    },
  });

  return (
    <form
      className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">New task</h2>

      <form.Field
        name="title"
        validators={{
          onSubmit: ({ value }) => {
            if (!value || value.length < 3) return "Title must be at least 3 characters";
            if (value.length > 120) return "Title must be at most 120 characters";
          },
        }}
      >
        {(field) => (
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="title">
              Title{" "}
              <span aria-hidden="true" className="text-red-500">
                *
              </span>
            </label>
            <input
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 transition outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-cyan-300"
              disabled={field.form.state.isSubmitting}
              id="title"
              name={field.name}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="What needs to be done?"
              type="text"
              value={field.state.value}
            />
            {field.state.meta.errors.length > 0 ? (
              <p className="text-xs text-red-500">{field.state.meta.errors.join(", ")}</p>
            ) : null}
          </div>
        )}
      </form.Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <form.Field name="dueDate">
          {(field) => (
            <div className="flex flex-col gap-1">
              <label
                className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
                htmlFor="dueDate"
              >
                Due date
              </label>
              <input
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 transition outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-cyan-300"
                disabled={field.form.state.isSubmitting}
                id="dueDate"
                name={field.name}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                type="date"
                value={field.state.value}
              />
            </div>
          )}
        </form.Field>
      </div>

      <form.Field name="notes">
        {(field) => (
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="notes">
              Notes
            </label>
            <textarea
              className="min-h-20 resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 transition outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-cyan-300"
              disabled={field.form.state.isSubmitting}
              id="notes"
              name={field.name}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="Optional notes..."
              value={field.state.value}
            />
          </div>
        )}
      </form.Field>

      <div className="flex justify-end">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600 dark:bg-cyan-400 dark:text-zinc-950 dark:hover:bg-cyan-300 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? (
                <Loader2 aria-hidden="true" className="animate-spin" size={16} />
              ) : (
                <Plus aria-hidden="true" size={16} />
              )}
              Add task
            </button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}

function TaskList() {
  const { data } = useListTasksSuspense();
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
