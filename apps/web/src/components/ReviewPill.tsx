import { ShieldQuestion } from "lucide-react";

import { useAppState } from "../state/client.tsx";
import type { State } from "../state/types.ts";
import { pendingApprovals } from "../state/view.ts";

const selectWaiting = (state: State) => pendingApprovals(state).length;

/** On narrow screens the coach panel is far down: a pill that takes the user to what waits for them. */
export function ReviewPill() {
  const waiting = useAppState(selectWaiting);
  if (waiting === 0) return null;
  return (
    <button
      className="bg-vitask-surface border-vitask-accent/60 text-vitask-accent fixed right-4 bottom-4 z-50 inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[13px] font-medium shadow-[0_8px_30px_rgba(0,0,0,0.35)] lg:hidden"
      onClick={() => {
        const card = document.querySelector<HTMLElement>('[data-approval-status="pending"]');
        card?.scrollIntoView({ behavior: "smooth", block: "center" });
        card?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
      }}
      type="button"
    >
      <ShieldQuestion aria-hidden="true" size={15} />
      {waiting === 1 ? "The coach needs your OK" : `${waiting} changes need your OK`}
    </button>
  );
}
