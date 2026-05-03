import { createFileRoute } from "@tanstack/react-router";
import { api } from "@vitask/backend-api";
import { useCallback, useState } from "react";

import { getSessionSnapshotFn } from "#/integrations/durable-streams/session.functions";

import { SessionHeader } from "./-components/SessionHeader";
import { SessionWrapUp } from "./-components/SessionWrapUp";
import { TasksPanel } from "./-components/TasksPanel";
import { TimersPanel } from "./-components/TimersPanel";

export const Route = createFileRoute("/dashboard/")({
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(api.getListTasksSuspenseQueryOptions()),
      queryClient.ensureQueryData(api.getListTimersSuspenseQueryOptions()),
      getSessionSnapshotFn(),
    ]),
  component: Dashboard,
});

function Dashboard() {
  const [, , sessionSnapshot] = Route.useLoaderData();

  const [sessionStartedAt, setSessionStartedAt] = useState(() => Date.now());
  const [firedCount, setFiredCount] = useState(0);
  const [snoozedCount, setSnoozedCount] = useState(0);

  const handleTimerFired = useCallback((count: number) => {
    setFiredCount((current) => current + count);
  }, []);
  const handleTimerSnoozed = useCallback(() => {
    setSnoozedCount((current) => current + 1);
  }, []);
  const resetSession = useCallback(() => {
    setFiredCount(0);
    setSnoozedCount(0);
    setSessionStartedAt(Date.now());
  }, []);

  return (
    <div className="vitask-surface font-vitask-body text-vitask-text-primary min-h-full">
      <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 p-6">
        <SessionHeader sessionStartedAt={sessionStartedAt}>
          <SessionWrapUp
            firedCount={firedCount}
            onComplete={resetSession}
            sessionStartedAt={sessionStartedAt}
            snoozedCount={snoozedCount}
          />
        </SessionHeader>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
          <TasksPanel
            initialHypes={sessionSnapshot.taskHypes}
            sessionStartedAt={sessionStartedAt}
          />
          <TimersPanel
            initialNudges={sessionSnapshot.timerNudges}
            onTimerFired={handleTimerFired}
            onTimerSnoozed={handleTimerSnoozed}
          />
        </div>
      </main>
    </div>
  );
}
