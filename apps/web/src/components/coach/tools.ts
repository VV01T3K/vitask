import {
  Brain,
  CalendarClock,
  CheckCheck,
  ListChecks,
  ListPlus,
  ListTree,
  Pencil,
  Timer,
  Trash2,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/** How each coach tool reads in the transcript. */
const TOOLS: Record<string, { label: string; Icon: LucideIcon }> = {
  list_tasks: { label: "read your tasks", Icon: ListChecks },
  list_timers: { label: "read your timers", Icon: Timer },
  get_session_stats: { label: "checked the session", Icon: CalendarClock },
  remember: { label: "remembered", Icon: Brain },
  add_task: { label: "add a task", Icon: ListPlus },
  update_task: { label: "change a task", Icon: Pencil },
  complete_task: { label: "complete a task", Icon: CheckCheck },
  delete_task: { label: "delete a task", Icon: Trash2 },
  break_down_task: { label: "break a task into steps", Icon: ListTree },
  plan_focus_blocks: { label: "plan focus blocks", Icon: CalendarClock },
  set_timer: { label: "set a care timer", Icon: Timer },
};

export function toolInfo(name: string): { label: string; Icon: LucideIcon } {
  return TOOLS[name] ?? { label: name.replaceAll("_", " "), Icon: Wrench };
}

/** A short "with what" for a call: the most telling argument. */
export function toolArgsHint(args: unknown): string | null {
  if (!args || typeof args !== "object") return null;
  const record = args as Record<string, unknown>;
  for (const key of ["title", "text", "label", "fact", "query"]) {
    const value = record[key];
    if (typeof value === "string" && value !== "")
      return value.length > 60 ? `${value.slice(0, 57)}…` : value;
  }
  return null;
}
