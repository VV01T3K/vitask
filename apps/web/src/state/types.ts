import type {
  ApprovalDecision,
  CareTimer,
  ErrorCode,
  Nudge,
  ServerMessage,
  Snapshot,
  Task,
  TurnLogEntry,
} from "@vitask/protocol";

/** An error as the UI shows it: a server error code, or one of the client's own. */
export type UiError = {
  code: ErrorCode | "network" | "invalid_response";
  message: string;
  retryAfterMs?: number;
  issues?: { path: string; message: string }[];
};

/**
 * `connecting`: first attempt. `open`: live. `reconnecting`: lost, a retry is scheduled at `retryAt`.
 * `offline`: the browser reports no network; the next try waits for it to come back.
 */
export type Connection =
  | { status: "connecting" }
  | { status: "open" }
  | { status: "reconnecting"; attempt: number; retryAt: number }
  | { status: "offline" };

/** A direct user action shown before the server confirms it; dropped on commit or rollback. */
export type Op =
  | { id: string; kind: "task.create"; task: Task }
  | { id: string; kind: "task.patch"; taskId: string; patch: Partial<Task> }
  | { id: string; kind: "task.delete"; taskId: string }
  | { id: string; kind: "timer.patch"; timerId: string; patch: Partial<CareTimer> }
  | { id: string; kind: "timer.delete"; timerId: string };

/** What the server answered to an op, folded into the confirmed state on commit. */
export type OpResult =
  | { task: Task }
  | { timer: CareTimer }
  | { deletedTaskId: string }
  | { deletedTimerId: string };

/** A chat message on its way: sent, accepted (waiting in the coach's queue) or refused. */
export type PendingChat = {
  requestId: string;
  text: string;
  /** Highest transcript entry id when it was sent; its user entry must come later. */
  afterEntryId: number;
  status: "sending" | "accepted" | "failed";
  error: UiError | null;
};

export type PendingDecision = { decision: ApprovalDecision; error: UiError | null };

export type State = {
  connection: Connection;
  /** The server's state: the last snapshot with every event since applied. Null until the first one. */
  server: Snapshot | null;
  /** Estimated server clock minus the local clock, for countdowns to server timestamps. */
  clockOffsetMs: number;
  ops: Op[];
  chats: PendingChat[];
  decisions: Record<string, PendingDecision>;
  /** Newest first. */
  turns: TurnLogEntry[];
  turnsLoaded: boolean;
  /** Nudges that arrived while the page was open and wait for the user, by timer id. */
  firing: Record<string, Nudge>;
};

export type Action =
  | { type: "connection"; connection: Connection }
  | { type: "message"; message: ServerMessage }
  | { type: "snapshot"; snapshot: Snapshot; clockOffsetMs?: number }
  | { type: "op.begin"; op: Op }
  | { type: "op.commit"; opId: string; result: OpResult }
  | { type: "op.rollback"; opId: string }
  | { type: "chat.begin"; requestId: string; text: string }
  | { type: "chat.accepted"; requestId: string }
  | { type: "chat.failed"; requestId: string; error: UiError }
  | { type: "chat.dismiss"; requestId: string }
  | { type: "decision.begin"; approvalId: string; decision: ApprovalDecision }
  | { type: "decision.failed"; approvalId: string; error: UiError }
  | { type: "turns.loaded"; turns: TurnLogEntry[] }
  | { type: "nudge.dismiss"; timerId: string };
