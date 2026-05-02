export type ActiveTask = {
  id: string;
  status: "active";
  title: string;
};

export type CompletedTask = {
  id: string;
  status: "completed";
  title: string;
  completedAgo: string;
  hype: string;
};

export type Task = ActiveTask | CompletedTask;

export type RunningTimer = {
  id: string;
  status: "running";
  icon: "droplet";
  title: string;
  description: string;
  countdown: string;
  progressPct: number;
  accent: string;
  isDefault?: boolean;
};

export type FiringTimer = {
  id: string;
  status: "firing";
  icon: "eye";
  title: string;
  description: string;
  aiMessage: string;
  isDefault?: boolean;
};

export type Timer = RunningTimer | FiringTimer;

export const activeTasks: ActiveTask[] = [
  { id: "t1", status: "active", title: "Refactor auth middleware to use new token shape" },
  { id: "t2", status: "active", title: "Write integration tests for /api/wrap-up" },
];

export const completedTasks: CompletedTask[] = [
  {
    id: "t0",
    status: "completed",
    title: "Fix navbar CSS alignment",
    completedAgo: "14 min ago",
    hype: "Done. Crushed. Demolished. Somewhere a project manager just felt a tingle of joy and didn't know why.",
  },
];

export const runningTimers: RunningTimer[] = [
  {
    id: "timer-hydration",
    status: "running",
    icon: "droplet",
    title: "Hydration",
    description: "Drink some water",
    countdown: "22:13",
    progressPct: 63,
    accent: "var(--color-vitask-accent)",
    isDefault: true,
  },
];

export const firingTimers: FiringTimer[] = [
  {
    id: "timer-eye-rest",
    status: "firing",
    icon: "eye",
    title: "Eye Rest (20-20-20)",
    description: "Look 20 feet away for 20 seconds",
    aiMessage:
      "Look 20 feet away for 20 seconds. You've completed solid work; eyes deserve the rest.",
    isDefault: true,
  },
];
