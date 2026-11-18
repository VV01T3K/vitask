import { z } from "zod";

import {
  Approval,
  BudgetStatus,
  CareTimer,
  CoachEntry,
  CoachLive,
  FocusPlan,
  HexColor,
  Hype,
  Id,
  LIMITS,
  MemoryFact,
  Nudge,
  Session,
  Task,
  TimerIcon,
  TurnLogEntry,
} from "./domain.ts";

/** Bumped on any breaking change to the HTTP API or the WebSocket messages. */
export const PROTOCOL_VERSION = 1;

const title = z.string().trim().min(1).max(LIMITS.taskTitle);
const minutes = z.number().int().min(1).max(LIMITS.estimateMinutes);

export const CreateTaskBody = z.strictObject({
  /**
   * Chosen by the client, so its optimistic copy and the server's `task.upserted` are the same task whichever
   * arrives first. Creating an id that exists returns that task (a retry is safe).
   */
  id: z
    .string()
    .regex(/^task_[\w-]{8,59}$/)
    .optional(),
  title,
  notes: z.string().max(LIMITS.taskNotes).optional(),
  parentId: Id.nullable().optional(),
  estimateMinutes: minutes.nullable().optional(),
});
export type CreateTaskBody = z.infer<typeof CreateTaskBody>;

export const UpdateTaskBody = z
  .strictObject({
    title: title.optional(),
    notes: z.string().max(LIMITS.taskNotes).optional(),
    status: z.enum(["open", "done"]).optional(),
    estimateMinutes: minutes.nullable().optional(),
    order: z.number().finite().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "Nothing to update");
export type UpdateTaskBody = z.infer<typeof UpdateTaskBody>;

const timerFields = {
  label: z.string().trim().min(1).max(LIMITS.timerLabel),
  purpose: z.string().max(LIMITS.timerPurpose),
  instructions: z.string().max(LIMITS.timerInstructions),
  intervalSeconds: z
    .number()
    .int()
    .min(LIMITS.timerIntervalSeconds.min)
    .max(LIMITS.timerIntervalSeconds.max),
  enabled: z.boolean(),
  icon: TimerIcon,
  color: HexColor,
};

export const CreateTimerBody = z.strictObject({
  ...timerFields,
  purpose: timerFields.purpose.optional(),
  instructions: timerFields.instructions.optional(),
  enabled: timerFields.enabled.optional(),
  icon: timerFields.icon.optional(),
  color: timerFields.color.optional(),
});
export type CreateTimerBody = z.infer<typeof CreateTimerBody>;

export const UpdateTimerBody = z
  .strictObject({
    label: timerFields.label.optional(),
    purpose: timerFields.purpose.optional(),
    instructions: timerFields.instructions.optional(),
    intervalSeconds: timerFields.intervalSeconds.optional(),
    enabled: timerFields.enabled.optional(),
    icon: timerFields.icon.optional(),
    color: timerFields.color.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "Nothing to update");
export type UpdateTimerBody = z.infer<typeof UpdateTimerBody>;

export const ChatBody = z.strictObject({
  text: z.string().trim().min(1).max(LIMITS.chatText),
  /** Client-generated; a retry with the same id is answered once. */
  requestId: z.string().min(8).max(64),
});
export type ChatBody = z.infer<typeof ChatBody>;

export const ApprovalDecision = z.enum(["approve", "reject"]);
export type ApprovalDecision = z.infer<typeof ApprovalDecision>;

export const DecideApprovalBody = z.strictObject({ decision: ApprovalDecision });
export type DecideApprovalBody = z.infer<typeof DecideApprovalBody>;

export const TurnLogQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const Snapshot = z.object({
  protocol: z.literal(PROTOCOL_VERSION),
  tasks: z.array(Task),
  timers: z.array(CareTimer),
  session: Session.nullable(),
  /** Nudges of the current or most recent session, newest last. */
  nudges: z.array(Nudge),
  hypes: z.array(Hype),
  /** Pending approvals and the most recent decided ones. */
  approvals: z.array(Approval),
  memory: z.array(MemoryFact),
  plan: FocusPlan.nullable(),
  coach: z.object({
    model: z.string(),
    entries: z.array(CoachEntry),
    live: CoachLive,
  }),
  budget: BudgetStatus,
});
export type Snapshot = z.infer<typeof Snapshot>;

export const ChatAccepted = z.object({ submissionId: z.number().int(), requestId: z.string() });
export type ChatAccepted = z.infer<typeof ChatAccepted>;

export const TurnLogResponse = z.object({ turns: z.array(TurnLogEntry) });

export const ErrorCode = z.enum([
  "bad_request",
  "unauthorized",
  "forbidden_origin",
  "not_found",
  "conflict",
  "rate_limited",
  "budget_exhausted",
  "no_active_session",
  "limit_reached",
  "internal",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** Every non-2xx JSON response, and the payload of a WebSocket `error` message. */
export const ApiError = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    /** Set with `rate_limited` and `budget_exhausted`: when trying again can succeed. */
    retryAfterMs: z.number().int().nonnegative().optional(),
    issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;
