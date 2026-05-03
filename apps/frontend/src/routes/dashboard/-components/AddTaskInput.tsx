import { model } from "@vitask/backend-api";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { useAppForm } from "#/integrations/tanstack/form";
import { getFieldErrorMessages } from "#/lib/formErrors";

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

export type TaskFormValues = z.input<typeof taskFormSchema>;

type AddTaskInputProps = {
  disabled: boolean;
  onAdd: (value: TaskFormValues) => Promise<string | null>;
};

export function AddTaskInput({ disabled, onAdd }: AddTaskInputProps) {
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
                  <div className="flex items-center gap-2">
                    <div className="bg-vitask-surface border-vitask-border focus-within:border-vitask-accent flex h-11 flex-1 items-center gap-2.5 rounded-md border px-3.5 transition-colors">
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
                    </div>
                    <button
                      aria-label="Add task"
                      className="bg-vitask-accent/15 border-vitask-accent/40 hover:bg-vitask-accent/25 hover:border-vitask-accent text-vitask-accent inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border text-lg leading-none transition-colors select-none disabled:opacity-40"
                      disabled={disabled || isSubmitting}
                      type="submit"
                    >
                      {isSubmitting ? (
                        <Loader2 aria-hidden="true" className="animate-spin" size={14} />
                      ) : (
                        "+"
                      )}
                    </button>
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
