import {
  timerColorOptions,
  timerIconOptions,
  type TimerAppearance,
} from "../../lib/timerAppearance.ts";
import { cx } from "../ui.tsx";

type IconOption = (typeof timerIconOptions)[number];
type ColorOption = (typeof timerColorOptions)[number];

type TimerAppearancePickerProps = {
  value: TimerAppearance;
  onChange: (next: TimerAppearance) => void;
  disabled?: boolean;
  vertical?: boolean;
};

export function TimerAppearancePicker({
  value,
  onChange,
  disabled,
  vertical,
}: TimerAppearancePickerProps) {
  const iconSize = 16;
  const iconButtonSize = "h-8 w-8";

  const iconButtons = timerIconOptions.map((option) => (
    <IconButton
      disabled={disabled}
      iconSize={iconSize}
      key={option.id}
      onSelect={() => onChange({ ...value, icon: option.id })}
      option={option}
      selected={value.icon === option.id}
      selectedColor={value.color}
      sizeClass={iconButtonSize}
    />
  ));

  const colorButtons = timerColorOptions.map((option) => (
    <ColorButton
      disabled={disabled}
      key={option.id}
      onSelect={() => onChange({ ...value, color: option.value })}
      option={option}
      selected={value.color === option.value}
    />
  ));

  if (vertical) {
    return (
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-1.5">{iconButtons}</div>
        <div className="bg-vitask-border h-px" />
        <div className="grid grid-cols-2 items-center justify-items-center gap-x-1.5 gap-y-2">
          {colorButtons}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">{iconButtons}</div>
      <div className="flex flex-wrap gap-1.5">{colorButtons}</div>
    </div>
  );
}

type IconButtonProps = {
  option: IconOption;
  selected: boolean;
  selectedColor: string;
  iconSize: number;
  sizeClass: string;
  disabled: boolean | undefined;
  onSelect: () => void;
};

function IconButton({
  option,
  selected,
  selectedColor,
  iconSize,
  sizeClass,
  disabled,
  onSelect,
}: IconButtonProps) {
  return (
    <button
      aria-label={`${option.label} icon`}
      aria-pressed={selected}
      className={cx(
        "border-vitask-border hover:border-vitask-border-bright flex items-center justify-center rounded-md border bg-transparent transition",
        sizeClass,
        selected && "border-vitask-accent bg-vitask-accent/10",
      )}
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      <option.Icon
        aria-hidden="true"
        size={iconSize}
        style={{ color: selected ? selectedColor : "var(--color-vitask-text-tertiary)" }}
      />
    </button>
  );
}

type ColorButtonProps = {
  option: ColorOption;
  selected: boolean;
  disabled: boolean | undefined;
  onSelect: () => void;
};

function ColorButton({ option, selected, disabled, onSelect }: ColorButtonProps) {
  return (
    <button
      aria-label={`${option.label} color`}
      aria-pressed={selected}
      className={cx(
        "border-vitask-border hover:border-vitask-border-bright flex h-6 w-6 items-center justify-center rounded-full border transition",
        selected && "border-vitask-accent ring-1 ring-vitask-accent/50",
      )}
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      <span className="h-4 w-4 rounded-full" style={{ backgroundColor: option.value }} />
    </button>
  );
}
