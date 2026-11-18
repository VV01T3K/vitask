import { z } from "zod";

/** Limits shared by the API, the coach tools and the store. */
export const LIMITS = {
  taskTitle: 200,
  taskNotes: 2_000,
  tasksTotal: 500,
  stepsPerTask: 20,
  estimateMinutes: 600,
  timerLabel: 120,
  timerPurpose: 240,
  timerInstructions: 1_000,
  timersTotal: 20,
  timerIntervalSeconds: { min: 1, max: 24 * 60 * 60 },
  memoryFact: 280,
  memoryFacts: 30,
  chatText: 4_000,
  planBlocks: 12,
  pendingApprovals: 5,
} as const;

export const Id = z.string().min(1).max(64);
export const Timestamp = z.number().int().nonnegative();

export const TaskStatus = z.enum(["open", "done"]);

export const Task = z.object({
  id: Id,
  title: z.string().min(1).max(LIMITS.taskTitle),
  notes: z.string().max(LIMITS.taskNotes),
  status: TaskStatus,
  /** A step of another task, created by `break_down_task` or by the user. */
  parentId: Id.nullable(),
  estimateMinutes: z.number().int().min(1).max(LIMITS.estimateMinutes).nullable(),
  order: z.number(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  completedAt: Timestamp.nullable(),
});
export type Task = z.infer<typeof Task>;

export const TIMER_ICONS = [
  "clock",
  "timer",
  "alarm",
  "bell",
  "hourglass",
  "hydration",
  "coffee",
  "focus",
  "pulse",
  "workout",
  "energy",
  "warm",
  "sun",
  "night",
] as const;
export const TimerIcon = z.enum(TIMER_ICONS);
export type TimerIcon = z.infer<typeof TimerIcon>;
export const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const CareTimer = z.object({
  id: Id,
  label: z.string().min(1).max(LIMITS.timerLabel),
  /** What the break is for, shown on the card ("Drink some water"). */
  purpose: z.string().max(LIMITS.timerPurpose),
  /** How the user wants to be nudged; fed to the nudge prompt as user data. */
  instructions: z.string().max(LIMITS.timerInstructions),
  intervalSeconds: z
    .number()
    .int()
    .min(LIMITS.timerIntervalSeconds.min)
    .max(LIMITS.timerIntervalSeconds.max),
  enabled: z.boolean(),
  icon: TimerIcon,
  color: HexColor,
  isDefault: z.boolean(),
  /** Next server-side fire time while a session is active, otherwise null. */
  nextFireAt: Timestamp.nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type CareTimer = z.infer<typeof CareTimer>;

export const SessionStatus = z.enum(["active", "wrapping_up", "ended"]);
export const SessionEndReason = z.enum(["user", "max_length"]);

export const Session = z.object({
  id: Id,
  status: SessionStatus,
  startedAt: Timestamp,
  endedAt: Timestamp.nullable(),
  endReason: SessionEndReason.nullable(),
  /** Hard stop for care timers; the session ends by itself at this time. */
  maxEndsAt: Timestamp,
  debrief: z.string().nullable(),
  debriefSource: z.enum(["ai", "fallback"]).nullable(),
});
export type Session = z.infer<typeof Session>;

export const TextSource = z.enum(["ai", "fallback"]);
export type TextSource = z.infer<typeof TextSource>;

export const Nudge = z.object({
  id: Id,
  sessionId: Id,
  timerId: Id,
  timerLabel: z.string(),
  message: z.string(),
  source: TextSource,
  firedAt: Timestamp,
});
export type Nudge = z.infer<typeof Nudge>;

export const Hype = z.object({
  taskId: Id,
  taskTitle: z.string(),
  sessionId: Id.nullable(),
  /** Null while the coach is still writing it. */
  message: z.string().nullable(),
  source: TextSource.nullable(),
  createdAt: Timestamp,
});
export type Hype = z.infer<typeof Hype>;

export const MemoryFact = z.object({
  id: Id,
  text: z.string().min(1).max(LIMITS.memoryFact),
  createdAt: Timestamp,
});
export type MemoryFact = z.infer<typeof MemoryFact>;

export const PlanBlock = z.object({
  taskId: Id,
  title: z.string(),
  minutes: z.number().int().min(1).max(LIMITS.estimateMinutes),
  note: z.string().max(200).nullable(),
});
export const FocusPlan = z.object({
  id: Id,
  blocks: z.array(PlanBlock),
  createdAt: Timestamp,
});
export type FocusPlan = z.infer<typeof FocusPlan>;

export const MUTATING_TOOLS = [
  "add_task",
  "update_task",
  "complete_task",
  "delete_task",
  "break_down_task",
  "plan_focus_blocks",
  "set_timer",
] as const;
export const MutatingTool = z.enum(MUTATING_TOOLS);
export type MutatingTool = z.infer<typeof MutatingTool>;

export const ApprovalStatus = z.enum([
  "pending",
  "approved",
  "rejected",
  "expired",
  "applied",
  "failed",
]);
export type ApprovalStatus = z.infer<typeof ApprovalStatus>;

export const Approval = z.object({
  id: Id,
  tool: MutatingTool,
  /** The exact arguments the coach called the tool with; an approval binds to them. */
  args: z.record(z.string(), z.unknown()),
  /** Human-readable description of what will change. */
  summary: z.string(),
  status: ApprovalStatus,
  createdAt: Timestamp,
  expiresAt: Timestamp,
  decidedAt: Timestamp.nullable(),
  /** What applying it did, or why it failed. */
  result: z.string().nullable(),
});
export type Approval = z.infer<typeof Approval>;

export const Trigger = z.enum(["chat", "hype", "nudge", "wrapup"]);
export type Trigger = z.infer<typeof Trigger>;

export const TurnOutcome = z.enum(["ok", "error", "aborted", "length", "budget_exhausted"]);
export type TurnOutcome = z.infer<typeof TurnOutcome>;

/** One model request. */
export const TurnLogEntry = z.object({
  id: Id,
  at: Timestamp,
  trigger: Trigger,
  conversationId: z.string().nullable(),
  runId: z.string().nullable(),
  provider: z.string(),
  model: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative().nullable(),
  latencyMs: z.number().int().nonnegative().nullable(),
  toolCalls: z.array(z.string()),
  outcome: TurnOutcome,
  error: z.string().nullable(),
});
export type TurnLogEntry = z.infer<typeof TurnLogEntry>;

/** A transcript item of the coach conversation, simplified for display. */
export const CoachEntry = z.object({
  /** pi-durable entry id; increases monotonically. */
  id: z.number().int(),
  role: z.enum(["user", "assistant", "tool", "notice"]),
  /** When the message was created, if the entry carries a message. */
  at: Timestamp.nullable(),
  text: z.string(),
  toolCalls: z.array(z.object({ id: z.string(), name: z.string(), args: z.unknown() })),
  toolName: z.string().nullable(),
  /** For `tool` entries: the call this result answers. */
  toolCallId: z.string().nullable(),
  /** For `tool` entries of a gated (mutating) tool: the approval the call went through. */
  approvalId: z.string().nullable(),
  isError: z.boolean(),
});
export type CoachEntry = z.infer<typeof CoachEntry>;

export const CoachToolActivity = z.object({
  callId: z.string(),
  name: z.string(),
  status: z.enum(["pending", "running", "done"]),
  approvalId: z.string().nullable(),
});

/** What the coach is doing right now. */
export const CoachLive = z.object({
  busy: z.boolean(),
  /** The streamed answer so far; replaced, not appended, on each update. */
  partialText: z.string(),
  tools: z.array(CoachToolActivity),
  /** Why the last run ended without an answer, until the next run starts. */
  failure: z.string().nullable(),
});
export type CoachLive = z.infer<typeof CoachLive>;

export const BudgetStatus = z.object({
  dailyTokenLimit: z.number().int().nonnegative(),
  tokensUsedToday: z.number().int().nonnegative(),
  chatPerMinute: z.number().int().nonnegative(),
});
export type BudgetStatus = z.infer<typeof BudgetStatus>;
