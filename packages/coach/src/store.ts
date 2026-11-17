import type {
  Approval,
  ApprovalStatus,
  CareTimer,
  FocusPlan,
  Hype,
  MemoryFact,
  Nudge,
  Session,
  Task,
  TextSource,
  TurnLogEntry,
} from "@vitask/protocol";

export type TaskPatch = Partial<
  Pick<Task, "title" | "notes" | "status" | "estimateMinutes" | "order" | "completedAt">
> & { updatedAt: number };

export type TimerPatch = Partial<
  Pick<
    CareTimer,
    | "label"
    | "purpose"
    | "instructions"
    | "intervalSeconds"
    | "enabled"
    | "icon"
    | "color"
    | "nextFireAt"
  >
> & { updatedAt: number };

export type SessionPatch = Partial<
  Pick<Session, "status" | "endedAt" | "endReason" | "debrief" | "debriefSource">
>;

/** Durable task ids the coach keeps next to domain rows, so it can abort or find them again. */
export type SessionTasks = {
  guardTaskId: number | null;
  wrapUpTaskId: number | null;
  handoffAt: number | null;
};

/**
 * Everything the coach reads and writes outside pi-durable. Every method is async so an implementation can sit on a
 * remote or queued database. Methods that guard against duplicates say so: the coach relies on them for idempotency,
 * because durable task phases and tool calls can run again after a restart.
 */
export interface WorkspaceStore {
  getMeta(key: string): Promise<string | undefined>;
  setMeta(key: string, value: string): Promise<void>;

  listTasks(): Promise<Task[]>;
  getTask(id: string): Promise<Task | undefined>;
  countTasks(): Promise<number>;
  insertTask(task: Task): Promise<void>;
  updateTask(id: string, patch: TaskPatch): Promise<Task | undefined>;
  /** Deletes the task and its steps; returns the ids removed. */
  deleteTask(id: string): Promise<string[]>;

  listTimers(): Promise<CareTimer[]>;
  getTimer(id: string): Promise<CareTimer | undefined>;
  insertTimer(timer: CareTimer): Promise<void>;
  updateTimer(id: string, patch: TimerPatch): Promise<CareTimer | undefined>;
  deleteTimer(id: string): Promise<boolean>;
  /** The durable care-timer task that currently drives this timer, if any. */
  getTimerTask(timerId: string): Promise<number | null>;
  setTimerTask(timerId: string, taskId: number | null): Promise<void>;

  getActiveSession(): Promise<Session | undefined>;
  getLatestSession(): Promise<Session | undefined>;
  getSession(id: string): Promise<Session | undefined>;
  insertSession(session: Session): Promise<void>;
  updateSession(id: string, patch: SessionPatch): Promise<Session | undefined>;
  /**
   * Moves a session from one status to another only if it is still in `from`; returns whether it moved. This is the
   * one place two paths (the user, the max-length guard) can race to end a session.
   */
  transitionSession(
    id: string,
    from: Session["status"],
    patch: SessionPatch,
  ): Promise<Session | undefined>;
  getSessionTasks(id: string): Promise<SessionTasks>;
  setSessionTasks(id: string, patch: Partial<SessionTasks>): Promise<void>;

  /** Inserts unless a nudge for the same timer and fire time exists; returns whether it inserted. */
  insertNudge(nudge: Nudge): Promise<boolean>;
  hasNudge(timerId: string, firedAt: number): Promise<boolean>;
  listNudges(sessionId: string): Promise<Nudge[]>;

  /** Claims the hype for a task: inserts a pending row unless one exists; returns whether it did. */
  claimHype(hype: Hype): Promise<boolean>;
  getHype(taskId: string): Promise<Hype | undefined>;
  setHypeMessage(taskId: string, message: string, source: TextSource): Promise<Hype | undefined>;
  listHypes(limit: number): Promise<Hype[]>;

  listMemory(): Promise<MemoryFact[]>;
  insertMemory(fact: MemoryFact): Promise<void>;
  deleteMemory(id: string): Promise<boolean>;

  insertApproval(approval: Approval, waitTaskId: number | null): Promise<boolean>;
  getApproval(id: string): Promise<Approval | undefined>;
  getApprovalWaitTask(id: string): Promise<number | null>;
  setApprovalWaitTask(id: string, taskId: number): Promise<void>;
  listApprovals(options: { status?: ApprovalStatus; limit: number }): Promise<Approval[]>;
  /** Changes the status only if the approval is in `from`; returns the updated approval, or undefined. */
  transitionApproval(
    id: string,
    from: readonly ApprovalStatus[],
    patch: { status: ApprovalStatus; decidedAt?: number; result?: string | null },
  ): Promise<Approval | undefined>;

  getPlan(): Promise<FocusPlan | undefined>;
  setPlan(plan: FocusPlan): Promise<void>;

  insertTurn(turn: TurnLogEntry): Promise<void>;
  listTurns(limit: number): Promise<TurnLogEntry[]>;
  /** Input plus output tokens of every turn at or after `since`. */
  tokensSince(since: number): Promise<number>;

  /** Records one chat submission and returns how many there were at or after `since`, this one included. */
  recordChat(at: number, since: number): Promise<number>;
}
