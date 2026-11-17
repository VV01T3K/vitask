import { z } from "zod";

import { ApiError, ApprovalDecision, PROTOCOL_VERSION, Snapshot } from "./api.ts";
import {
  Approval,
  BudgetStatus,
  CareTimer,
  CoachEntry,
  CoachLive,
  FocusPlan,
  Hype,
  Id,
  LIMITS,
  MemoryFact,
  Nudge,
  Session,
  Task,
  TurnLogEntry,
} from "./domain.ts";

/**
 * Events change the client's copy of the snapshot. The server sends `hello` with a full snapshot on every connect
 * (and in answer to `resync`), then one event per change. Applying events in order keeps the copy equal to a fresh
 * snapshot; a client that falls behind (a reconnect) asks for a new snapshot instead of replaying.
 */
export const ServerEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("task.upserted"), task: Task }),
  z.object({ type: z.literal("task.deleted"), id: Id }),
  z.object({ type: z.literal("timer.upserted"), timer: CareTimer }),
  z.object({ type: z.literal("timer.deleted"), id: Id }),
  z.object({ type: z.literal("session.updated"), session: Session }),
  z.object({ type: z.literal("nudge"), nudge: Nudge }),
  z.object({ type: z.literal("hype"), hype: Hype }),
  z.object({ type: z.literal("approval.upserted"), approval: Approval }),
  z.object({ type: z.literal("memory.updated"), memory: z.array(MemoryFact) }),
  z.object({ type: z.literal("plan.updated"), plan: FocusPlan }),
  /** A committed transcript item; ids increase. */
  z.object({ type: z.literal("coach.entry"), entry: CoachEntry }),
  /** The coach's live state: streamed text, running tools; sent whole on each change. */
  z.object({ type: z.literal("coach.live"), live: CoachLive }),
  z.object({ type: z.literal("turn.logged"), turn: TurnLogEntry }),
  z.object({ type: z.literal("budget.updated"), budget: BudgetStatus }),
]);
export type ServerEvent = z.infer<typeof ServerEvent>;

export const ServerMessage = z.union([
  ServerEvent,
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("hello"),
      protocol: z.literal(PROTOCOL_VERSION),
      snapshot: Snapshot,
    }),
    /** Answer to a command that succeeded. */
    z.object({ type: z.literal("ack"), requestId: z.string(), result: z.unknown() }),
    /** Answer to a command that failed, or a protocol violation (`requestId` absent). */
    z.object({
      type: z.literal("error"),
      requestId: z.string().nullable(),
      error: ApiError.shape.error,
    }),
    z.object({ type: z.literal("pong") }),
  ]),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;

const requestId = z.string().min(8).max(64);

export const ClientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ping") }),
  z.object({ type: z.literal("resync") }),
  z.object({
    type: z.literal("chat.send"),
    requestId,
    text: z.string().trim().min(1).max(LIMITS.chatText),
  }),
  z.object({
    type: z.literal("approval.decide"),
    requestId,
    approvalId: Id,
    decision: ApprovalDecision,
  }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

/** WebSocket path; clients pass `?protocol=<PROTOCOL_VERSION>` and the server refuses other versions. */
export const WS_PATH = "/api/ws";
