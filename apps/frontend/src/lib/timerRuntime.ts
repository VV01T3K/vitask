import type { model } from "@vitask/backend-api";

type TimerResponse = model.TimerResponse;

export type Runtime = {
  nextFireAt: number;
  firing: boolean;
  message: string | null;
  sweeping?: boolean;
};

export type Runtimes = Record<string, Runtime>;

export function durationSeconds(timer: Pick<TimerResponse, "durationSeconds">): number {
  return Number(timer.durationSeconds);
}

export function createRuntime(
  timerDurationSeconds: number,
  remainingSeconds = timerDurationSeconds,
): Runtime {
  const now = Date.now();

  return {
    nextFireAt: now + remainingSeconds * 1000,
    firing: false,
    message: null,
  };
}

export function getRemainingSeconds(
  runtime: Runtime | undefined,
  timerDurationSeconds: number,
  now: number,
) {
  if (!runtime) return timerDurationSeconds;
  if (runtime.firing) return 0;

  return Math.max(0, Math.ceil((runtime.nextFireAt - now) / 1000));
}

export function syncRuntimesWithTimers(
  previous: Runtimes,
  timers: Array<Pick<TimerResponse, "id" | "durationSeconds">>,
): Runtimes {
  const next: Runtimes = {};

  for (const timer of timers) {
    const current = previous[timer.id];
    next[timer.id] = current ?? createRuntime(durationSeconds(timer));
  }

  return next;
}
