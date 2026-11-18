import { Activity, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { describeError } from "../lib/errors.ts";
import { connect, useAppState, useClient } from "../state/client.tsx";
import type { State, UiError } from "../state/types.ts";
import { AccountMenu } from "./AccountMenu.tsx";
import { ActivityDrawer } from "./ActivityDrawer.tsx";
import { CoachPanel } from "./coach/CoachPanel.tsx";
import { ConnectionBadge } from "./ConnectionBadge.tsx";
import { Header } from "./Header.tsx";
import { MemoryPanel } from "./MemoryPanel.tsx";
import { Notifications } from "./Notifications.tsx";
import { PlanCard } from "./PlanCard.tsx";
import { ReviewPill } from "./ReviewPill.tsx";
import { SessionHeader } from "./session/SessionHeader.tsx";
import { TasksPanel } from "./tasks/TasksPanel.tsx";
import { TimersPanel } from "./timers/TimersPanel.tsx";
import { buttonClass, ErrorText } from "./ui.tsx";

const selectReady = (state: State) => state.server !== null;

export function Dashboard() {
  const client = useClient();
  const ready = useAppState(selectReady);
  const [bootError, setBootError] = useState<UiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [activityOpen, setActivityOpen] = useState(false);

  // The HTTP snapshot sets the workspace cookie; only then can the WebSocket connect.
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    void client.actions.bootstrap().then((error) => {
      if (cancelled) return;
      setBootError(error);
      if (!error) stop = connect(client);
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [client, attempt]);

  return (
    <div className="flex min-h-full flex-col">
      <Header>
        {ready ? <ConnectionBadge /> : null}
        <button
          aria-label="Agent activity"
          className="border-vitask-border bg-vitask-surface text-vitask-text-secondary hover:border-vitask-border-bright hover:bg-vitask-elevated hover:text-vitask-text-primary inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px]"
          onClick={() => setActivityOpen(true)}
          type="button"
        >
          <Activity aria-hidden="true" size={14} />
          <span className="hidden sm:inline">Activity</span>
        </button>
        <AccountMenu />
      </Header>
      <div className="vitask-surface font-vitask-body text-vitask-text-primary flex-1">
        {!ready ? (
          <main className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-24 text-center">
            {bootError ? (
              <>
                <ErrorText>{describeError(bootError)}</ErrorText>
                <button
                  className={buttonClass.primary}
                  onClick={() => setAttempt((n) => n + 1)}
                  type="button"
                >
                  Try again
                </button>
              </>
            ) : (
              <p
                className="font-vitask-mono text-vitask-text-tertiary inline-flex items-center gap-2 text-[13px]"
                role="status"
              >
                <Loader2 aria-hidden="true" className="animate-spin" size={14} /> loading your
                workspace
              </p>
            )}
          </main>
        ) : (
          <main className="mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
            <div className="flex min-w-0 flex-col gap-4">
              <SessionHeader />
              <PlanCard />
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[3fr_2fr]">
                <TasksPanel />
                <div className="flex min-w-0 flex-col gap-6">
                  <TimersPanel />
                  <MemoryPanel />
                </div>
              </div>
            </div>
            <div className="lg:sticky lg:top-4 lg:h-[calc(100dvh-6rem)] lg:self-start">
              <CoachPanel />
            </div>
          </main>
        )}
      </div>
      {ready ? (
        <>
          <Notifications />
          <ReviewPill />
        </>
      ) : null}
      {activityOpen ? <ActivityDrawer onClose={() => setActivityOpen(false)} /> : null}
    </div>
  );
}
