import { fmtMinutes } from "../../lib/format.ts";
import { cx } from "../ui.tsx";

const PRESETS = [5, 10, 15, 25, 30, 45, 60, 90, 120];

/** The estimate badge; a native select so it works with the keyboard and screen readers as is. */
export function EstimateSelect({
  value,
  label,
  disabled,
  onChange,
}: {
  value: number | null;
  label: string;
  disabled?: boolean;
  onChange: (minutes: number | null) => void;
}) {
  const options =
    value !== null && !PRESETS.includes(value)
      ? [...PRESETS, value].sort((a, b) => a - b)
      : PRESETS;
  return (
    <select
      aria-label={`Estimate for ${label}`}
      className={cx(
        "font-vitask-mono hover:border-vitask-border-bright h-6 shrink-0 cursor-pointer appearance-none rounded border bg-transparent px-1.5 text-center text-[11px] tabular-nums transition",
        value === null
          ? "border-vitask-border text-vitask-text-tertiary w-9 border-dashed opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus:opacity-100 max-sm:opacity-100"
          : "border-vitask-border text-vitask-text-secondary w-12",
      )}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
      title="Estimate"
      value={value ?? ""}
    >
      <option value="">{value === null ? "est" : "none"}</option>
      {options.map((minutes) => (
        <option key={minutes} value={minutes}>
          {fmtMinutes(minutes)}
        </option>
      ))}
    </select>
  );
}
