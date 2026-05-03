import { useStore } from "@tanstack/react-form";
import { useId, type ReactNode } from "react";

import { useFieldContext, useFormContext } from "#/integrations/tanstack/form/context";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const fieldShellClass = "flex flex-col gap-1";
const labelClass = "text-sm font-medium text-zinc-700 dark:text-zinc-300";
const controlClass =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 transition outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-cyan-300 dark:disabled:bg-zinc-900/60 dark:disabled:text-zinc-500";
const errorClass = "text-xs text-red-500";

type SubscribeButtonProps = {
  className?: string;
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  pendingIcon?: ReactNode;
  pendingLabel?: string;
};

export function SubscribeButton({
  className,
  disabled,
  icon,
  label,
  pendingIcon,
  pendingLabel,
}: SubscribeButtonProps) {
  const form = useFormContext();
  return (
    <form.Subscribe
      selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
    >
      {({ canSubmit, isSubmitting }) => (
        <button
          className={cx(
            "inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600 dark:bg-cyan-400 dark:text-zinc-950 dark:hover:bg-cyan-300 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500",
            className,
          )}
          disabled={disabled || isSubmitting || !canSubmit}
          type="submit"
        >
          {isSubmitting ? pendingIcon : icon}
          {isSubmitting ? (pendingLabel ?? label) : label}
        </button>
      )}
    </form.Subscribe>
  );
}

function getErrorMessages(errors: unknown[]): string[] {
  return errors.flatMap((error) => {
    if (!error) return [];
    if (Array.isArray(error)) return getErrorMessages(error);
    if (typeof error === "string") return [error];
    if (typeof error === "object" && "message" in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string") return [message];
    }
    return ["Invalid value"];
  });
}

function ErrorMessages({ errors }: { errors: unknown[] }) {
  const messages = [...new Set(getErrorMessages(errors))];

  if (messages.length === 0) return null;

  return (
    <>
      {messages.map((message, index) => (
        <p className={errorClass} key={`${message}-${index}`}>
          {message}
        </p>
      ))}
    </>
  );
}

type TextFieldProps = {
  className?: string;
  disabled?: boolean;
  id?: string;
  label: string;
  placeholder?: string;
  required?: boolean;
};

function useFieldId(id: string | undefined, fieldName: string) {
  const generatedId = useId();
  return id ?? `${fieldName}-${generatedId}`;
}

export function TextField({
  className,
  disabled,
  id: idProp,
  label,
  placeholder,
  required,
}: TextFieldProps) {
  const field = useFieldContext<string>();
  const id = useFieldId(idProp, field.name);
  const isSubmitting = useStore(field.form.store, (state) => state.isSubmitting);
  const meta = useStore(field.store, (state) => state.meta);

  return (
    <div className={cx(fieldShellClass, className)}>
      <label className={labelClass} htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-red-500">
            {" "}
            *
          </span>
        ) : null}
      </label>
      <input
        className={controlClass}
        disabled={disabled || isSubmitting}
        id={id}
        name={field.name}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        placeholder={placeholder}
        type="text"
        value={field.state.value}
      />
      {meta.isTouched && !meta.isPristine ? <ErrorMessages errors={meta.errors} /> : null}
    </div>
  );
}

type TextAreaProps = {
  className?: string;
  disabled?: boolean;
  id?: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  rows?: number;
};

export function TextArea({
  className,
  disabled,
  id: idProp,
  label,
  placeholder,
  required,
  rows = 3,
}: TextAreaProps) {
  const field = useFieldContext<string>();
  const id = useFieldId(idProp, field.name);
  const isSubmitting = useStore(field.form.store, (state) => state.isSubmitting);
  const meta = useStore(field.store, (state) => state.meta);

  return (
    <div className={cx(fieldShellClass, className)}>
      <label className={labelClass} htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-red-500">
            {" "}
            *
          </span>
        ) : null}
      </label>
      <textarea
        className={cx(controlClass, "resize-none")}
        disabled={disabled || isSubmitting}
        id={id}
        name={field.name}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        value={field.state.value}
      />
      {meta.isTouched && !meta.isPristine ? <ErrorMessages errors={meta.errors} /> : null}
    </div>
  );
}

export function Select({
  className,
  disabled,
  id: idProp,
  label,
  required,
  values,
}: {
  className?: string;
  disabled?: boolean;
  id?: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  values: Array<{ label: string; value: string }>;
}) {
  const field = useFieldContext<string>();
  const id = useFieldId(idProp, field.name);
  const isSubmitting = useStore(field.form.store, (state) => state.isSubmitting);
  const meta = useStore(field.store, (state) => state.meta);

  return (
    <div className={cx(fieldShellClass, className)}>
      <label className={labelClass} htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-red-500">
            {" "}
            *
          </span>
        ) : null}
      </label>
      <select
        className={controlClass}
        disabled={disabled || isSubmitting}
        id={id}
        name={field.name}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        value={field.state.value}
      >
        {values.map((value) => (
          <option key={value.value} value={value.value}>
            {value.label}
          </option>
        ))}
      </select>
      {meta.isTouched && !meta.isPristine ? <ErrorMessages errors={meta.errors} /> : null}
    </div>
  );
}
