import { Sparkle, X } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

import { useClient } from "../state/client.tsx";

const TOAST_MS = 5000;

function CoachToast({
  title,
  message,
  toastId,
}: {
  title: string;
  message: string;
  toastId: string | number;
}) {
  return (
    <div className="vitask-hype-toast" role="status">
      <div className="vitask-hype-toast-body">
        <div className="vitask-hype-toast-header">
          <span className="text-vitask-teal font-vitask-mono inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold tracking-[0.12em] uppercase">
            <Sparkle aria-hidden="true" size={9} strokeWidth={2.5} />
            AI
          </span>
          <span className="text-vitask-text-secondary min-w-0 flex-1 truncate text-[11px]">
            {title}
          </span>
          <button
            aria-label="Dismiss"
            className="vitask-hype-toast-close"
            onClick={() => toast.dismiss(toastId)}
            type="button"
          >
            <X aria-hidden="true" size={11} strokeWidth={2} />
          </button>
        </div>
        <p className="text-vitask-text-primary text-[13px] leading-[1.55]">{message}</p>
      </div>
      <div aria-hidden="true" className="vitask-hype-toast-progress" />
    </div>
  );
}

/** Toasts for what the coach says outside the chat: a cheer for a finished task, a care nudge. */
export function Notifications() {
  const { store } = useClient();
  useEffect(
    () =>
      store.onMessage((message) => {
        if (message.type === "hype" && message.hype.message)
          toast.custom(
            (id) => (
              <CoachToast
                message={message.hype.message!}
                title={message.hype.taskTitle}
                toastId={id}
              />
            ),
            {
              duration: TOAST_MS,
              id: `hype-${message.hype.taskId}-${message.hype.createdAt}`,
            },
          );
        if (message.type === "nudge")
          toast.custom(
            (id) => (
              <CoachToast
                message={message.nudge.message}
                title={message.nudge.timerLabel}
                toastId={id}
              />
            ),
            {
              duration: TOAST_MS,
              id: `nudge-${message.nudge.id}`,
            },
          );
      }),
    [store],
  );
  return null;
}
