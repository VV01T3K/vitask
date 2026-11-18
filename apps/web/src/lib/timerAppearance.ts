import type { TimerIcon } from "@vitask/protocol";
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
] as const satisfies Array<{ id: TimerIcon; label: string; Icon: LucideIcon }>;

export const timerColorOptions = [
  { id: "teal", label: "Teal", value: "#2fb7ad" },
  { id: "blue", label: "Blue", value: "#4f8fea" },
  { id: "green", label: "Green", value: "#41b06e" },
  { id: "amber", label: "Amber", value: "#f2a441" },
  { id: "coral", label: "Coral", value: "#f07b5a" },
  { id: "slate", label: "Slate", value: "#6b7280" },
] as const;

export type TimerAppearance = {
  icon: TimerIcon;
  color: string;
};

export const defaultTimerAppearance: TimerAppearance = {
  icon: "clock",
  color: "#4f8fea",
};

export function getTimerIconOption(icon: TimerIcon) {
  return timerIconOptions.find((option) => option.id === icon) ?? timerIconOptions[0];
}
