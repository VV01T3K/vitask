import { useServerFn } from "@tanstack/react-start";
import { api } from "@vitask/backend-api";
import { Sparkle } from "lucide-react";
import { useCallback, useState } from "react";

import { generateWrapUpFn } from "#/functions/wrapup.functions";

import { WrapUpModal } from "./WrapUpModal.tsx";

type WrapUpStats = {
  tasks: number;
  fired: number;
  snoozed: number;
  minutes: number;
};

const emptyStats: WrapUpStats = { tasks: 0, fired: 0, snoozed: 0, minutes: 0 };

type SessionWrapUpProps = {
  sessionStartedAt: number;
  firedTimers: { id: string; title: string }[];
  snoozedTimers: { id: string; title: string }[];
  onComplete: () => void;
};

export function SessionWrapUp({
  sessionStartedAt,
  firedTimers,
  snoozedTimers,
  onComplete,
}: SessionWrapUpProps) {
  const { data: tasksResponse } = api.useListTasksSuspense();
  const { data: timersResponse } = api.useListTimersSuspense();
  const wrapUpTasks = api.useWrapUpTasks();
  const generateWrapUp = useServerFn(generateWrapUpFn);

  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [stats, setStats] = useState<WrapUpStats>(emptyStats);

  const handleClick = useCallback(async () => {
    const minutes = Math.floor((Date.now() - sessionStartedAt) / 60000);
    const completedTaskCount = tasksResponse.data.filter((task) => task.isCompleted).length;

    setStats({
      tasks: completedTaskCount,
      fired: firedTimers.length,
      snoozed: snoozedTimers.length,
      minutes,
    });
    setOpen(true);
    setText("...");

    const sessionTasks = await wrapUpTasks.mutateAsync();
    const debrief = await generateWrapUp({
      data: {
        firedCount: firedTimers.length,
        snoozedCount: snoozedTimers.length,
        minutes,
        tasks: sessionTasks.data.map((task) => ({
          title: task.title,
          isCompleted: task.isCompleted,
        })),
        timers: timersResponse.data.map((timer) => {
          const isFired = firedTimers.some((t) => t.id === timer.id);
          const isSnoozed = snoozedTimers.some((t) => t.id === timer.id);
          return {
            title: timer.title,
            description: timer.description,
            status: isFired ? "fired" : isSnoozed ? "snoozed" : "unused",
          };
        }),
      },
    });

    setText(debrief);
  }, [
    firedTimers,
    generateWrapUp,
    sessionStartedAt,
    snoozedTimers,
    tasksResponse.data,
    timersResponse.data,
    wrapUpTasks,
  ]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setText("");
    onComplete();
  }, [onComplete]);

  return (
    <>
      <button
        className="border-vitask-border text-vitask-text-secondary hover:border-vitask-border-bright hover:bg-vitask-surface hover:text-vitask-text-primary inline-flex items-center gap-2 rounded border bg-transparent px-3.5 py-1.5 text-[13px] font-medium transition"
        onClick={() => {
          void handleClick();
        }}
        type="button"
      >
        Wrap up session <Sparkle aria-hidden="true" className="text-vitask-teal" size={12} />
      </button>
      <WrapUpModal debriefText={text} onClose={handleClose} open={open} stats={stats} />
    </>
  );
}
