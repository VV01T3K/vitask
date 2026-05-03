import { timerColorOptions, timerIconOptions, type TimerAppearance } from "#/lib/timerAppearance";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type TimerAppearancePickerProps = {
  value: TimerAppearance;
  onChange: (next: TimerAppearance) => void;
  disabled?: boolean;
  compact?: boolean;
  vertical?: boolean;
};

export function TimerAppearancePicker({
  value,
  onChange,
  disabled,
  compact,
  vertical,
}: TimerAppearancePickerProps) {
  const iconSize = compact || vertical ? 16 : 18;

  if (vertical) {
    return (
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-1.5">
          {timerIconOptions.map((option) => {
            const selected = value.icon === option.id;
            return (
              <button
                aria-label={`Select ${option.label} icon`}
                className={cx(
                  "border-vitask-border hover:border-vitask-border-bright flex h-8 w-8 items-center justify-center rounded-md border bg-transparent transition",
                  selected && "border-vitask-accent bg-vitask-accent/10",
                )}
                disabled={disabled}
                key={option.id}
                onClick={() => onChange({ ...value, icon: option.id })}
                type="button"
              >
                <option.Icon
                  aria-hidden="true"
                  size={iconSize}
                  style={{ color: selected ? value.color : "var(--color-vitask-text-tertiary)" }}
                />
              </button>
            );
          })}
        </div>
        <div className="bg-vitask-border h-px" />
        <div className="grid grid-cols-2 items-center justify-items-center gap-x-1.5 gap-y-2">
          {timerColorOptions.map((option) => {
            const selected = value.color === option.value;
            return (
              <button
                aria-label={`Set color to ${option.label}`}
                className={cx(
                  "border-vitask-border hover:border-vitask-border-bright flex h-6 w-6 items-center justify-center rounded-full border transition",
                  selected && "border-vitask-accent ring-1 ring-vitask-accent/50",
                )}
                disabled={disabled}
                key={option.id}
                onClick={() => onChange({ ...value, color: option.value })}
                type="button"
              >
                <span className="h-4 w-4 rounded-full" style={{ backgroundColor: option.value }} />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={cx("flex flex-col gap-3", compact && "gap-2")}>
      <div className={cx("flex flex-wrap gap-2", compact && "gap-1.5")}>
        {timerIconOptions.map((option) => {
          const selected = value.icon === option.id;
          return (
            <button
              aria-label={`Select ${option.label} icon`}
              className={cx(
                "border-vitask-border hover:border-vitask-border-bright flex items-center justify-center rounded-md border bg-transparent transition",
                compact ? "h-8 w-8" : "h-9 w-9",
                selected && "border-vitask-accent bg-vitask-accent/10",
              )}
              disabled={disabled}
              key={option.id}
              onClick={() => onChange({ ...value, icon: option.id })}
              type="button"
            >
              <option.Icon
                aria-hidden="true"
                size={iconSize}
                style={{ color: selected ? value.color : "var(--color-vitask-text-tertiary)" }}
              />
            </button>
          );
        })}
      </div>

      <div className={cx("flex flex-wrap gap-2", compact && "gap-1.5")}>
        {timerColorOptions.map((option) => {
          const selected = value.color === option.value;
          return (
            <button
              aria-label={`Set color to ${option.label}`}
              className={cx(
                "border-vitask-border hover:border-vitask-border-bright flex h-6 w-6 items-center justify-center rounded-full border transition",
                selected && "border-vitask-accent ring-1 ring-vitask-accent/50",
              )}
              disabled={disabled}
              key={option.id}
              onClick={() => onChange({ ...value, color: option.value })}
              type="button"
            >
              <span className="h-4 w-4 rounded-full" style={{ backgroundColor: option.value }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
