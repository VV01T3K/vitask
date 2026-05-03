import { Sparkle, X } from "lucide-react";
import { toast } from "sonner";

type TaskHypeToastProps = {
  taskTitle: string;
  message: string;
  toastId: string | number;
};

export function TaskHypeToast({ taskTitle, message, toastId }: TaskHypeToastProps) {
  return (
    <div className="vitask-hype-toast">
      <div className="vitask-hype-toast-body">
        <div className="vitask-hype-toast-header">
          <span className="text-vitask-teal font-vitask-mono inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold tracking-[0.12em] uppercase">
            <Sparkle aria-hidden="true" size={9} strokeWidth={2.5} />
            AI
          </span>
          <span className="text-vitask-text-secondary min-w-0 flex-1 truncate text-[11px]">
            {taskTitle}
          </span>
          <button
            aria-label="Dismiss"
            className="vitask-hype-toast-close"
            onClick={() => toast.dismiss(toastId)}
            type="button"
          >
            <X size={11} strokeWidth={2} />
          </button>
        </div>
        <p className="text-vitask-text-primary text-[13px] leading-[1.55]">{message}</p>
      </div>
      <div aria-hidden="true" className="vitask-hype-toast-progress" />
    </div>
  );
}
