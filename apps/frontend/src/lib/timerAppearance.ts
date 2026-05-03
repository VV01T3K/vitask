import {
  AlarmClock,
  BellRing,
  Brain,
  Clock,
  Coffee,
  Droplet,
  Dumbbell,
  Flame,
  HeartPulse,
  Hourglass,
  MoonStar,
  Sun,
  Timer,
  Zap,
  type LucideIcon,
} from "lucide-react";

export const timerIconOptions = [
  { id: "clock", label: "Clock", Icon: Clock },
  { id: "timer", label: "Timer", Icon: Timer },
  { id: "alarm", label: "Alarm", Icon: AlarmClock },
  { id: "bell", label: "Bell", Icon: BellRing },
  { id: "hourglass", label: "Hourglass", Icon: Hourglass },
  { id: "hydration", label: "Hydration", Icon: Droplet },
  { id: "coffee", label: "Coffee", Icon: Coffee },
  { id: "focus", label: "Focus", Icon: Brain },
  { id: "pulse", label: "Pulse", Icon: HeartPulse },
  { id: "workout", label: "Workout", Icon: Dumbbell },
  { id: "energy", label: "Energy", Icon: Zap },
  { id: "warm", label: "Warm", Icon: Flame },
  { id: "sun", label: "Sun", Icon: Sun },
  { id: "night", label: "Night", Icon: MoonStar },
] as const satisfies Array<{ id: string; label: string; Icon: LucideIcon }>;

export type TimerIconKey = (typeof timerIconOptions)[number]["id"];

export const timerColorOptions = [
  { id: "teal", label: "Teal", value: "#2fb7ad" },
  { id: "blue", label: "Blue", value: "#4f8fea" },
  { id: "green", label: "Green", value: "#41b06e" },
  { id: "amber", label: "Amber", value: "#f2a441" },
  { id: "coral", label: "Coral", value: "#f07b5a" },
  { id: "slate", label: "Slate", value: "#6b7280" },
] as const;

export type TimerColorValue = (typeof timerColorOptions)[number]["value"];

export type TimerAppearance = {
  icon: TimerIconKey;
  color: string;
};

export const defaultTimerAppearance: TimerAppearance = {
  icon: "clock",
  color: "#4f8fea",
};

const hexColorPattern = /^#[0-9a-fA-F]{6}$/;

export function getTimerIconOption(icon: string | null | undefined) {
  return timerIconOptions.find((option) => option.id === icon) ?? timerIconOptions[0];
}

export function normalizeTimerAppearance(
  appearance: Partial<TimerAppearance> | null | undefined,
): TimerAppearance {
  const iconOption = getTimerIconOption(appearance?.icon);
  const color =
    appearance?.color && hexColorPattern.test(appearance.color)
      ? appearance.color
      : defaultTimerAppearance.color;

  return {
    icon: iconOption.id,
    color,
  };
}
