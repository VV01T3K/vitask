import { Check, CircleAlert, CircleDashed, Hand, Loader2 } from "lucide-react";

import type { ToolStatus, ToolView } from "../../state/transcript.ts";
import { cx } from "../ui.tsx";
import { ApprovalCard } from "./ApprovalCard.tsx";
import { toolArgsHint, toolInfo } from "./tools.ts";

const STATUS: Record<
  ToolStatus,
  { label: string; tone: string; Icon: typeof Check; spin?: boolean }
> = {
  running: { label: "running", tone: "text-vitask-accent", Icon: Loader2, spin: true },
  waiting: { label: "waiting for you", tone: "text-vitask-amber", Icon: Hand },
  done: { label: "done", tone: "text-vitask-green", Icon: Check },
  error: { label: "failed", tone: "text-vitask-coral", Icon: CircleAlert },
  stopped: { label: "no result", tone: "text-vitask-text-tertiary", Icon: CircleDashed },
};

/** One tool call inline in the transcript; a gated call shows its approval card. */
export function ToolRow({ tool }: { tool: ToolView }) {
  const { label, Icon } = toolInfo(tool.name);
  const status = STATUS[tool.status];
  const hint = toolArgsHint(tool.args);
  if (tool.approval) return <ApprovalCard approval={tool.approval} />;
  return (
    <div
      className="font-vitask-mono border-vitask-border bg-vitask-bg/60 flex min-w-0 flex-col gap-1 rounded border px-2.5 py-1.5 text-[11px]"
      data-tool={tool.name}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon aria-hidden="true" className="text-vitask-text-tertiary shrink-0" size={12} />
        <span className="text-vitask-text-secondary shrink-0">{label}</span>
        {hint ? <span className="text-vitask-text-tertiary min-w-0 truncate">“{hint}”</span> : null}
        <span className={cx("ml-auto inline-flex shrink-0 items-center gap-1", status.tone)}>
          <status.Icon
            aria-hidden="true"
            className={status.spin ? "animate-spin" : undefined}
            size={11}
          />
          {status.label}
        </span>
      </div>
      {tool.status === "error" && tool.result ? (
        <p className="text-vitask-coral line-clamp-2">{tool.result}</p>
      ) : null}
    </div>
  );
}
