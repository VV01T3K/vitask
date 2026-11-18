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

import type { SessionPatch, SessionTasks, TaskPatch, TimerPatch, WorkspaceStore } from "./store.ts";

const copy = <T>(value: T): T => structuredClone(value);
const byOrder = (a: Task, b: Task) => a.order - b.order || a.createdAt - b.createdAt;

/** A `WorkspaceStore` in plain memory, for tests and for running the coach in Node (evals). */
export class InMemoryWorkspaceStore implements WorkspaceStore {
  readonly #meta = new Map<string, string>();
  readonly #tasks = new Map<string, Task>();
  readonly #timers = new Map<string, CareTimer>();
  readonly #timerTasks = new Map<string, number | null>();
  readonly #sessions = new Map<string, Session>();
  readonly #sessionTasks = new Map<string, SessionTasks>();
  readonly #nudges: Nudge[] = [];
  readonly #hypes = new Map<string, Hype>();
  readonly #memory = new Map<string, MemoryFact>();
  readonly #approvals = new Map<string, { approval: Approval; waitTaskId: number | null }>();
  #plan: FocusPlan | undefined;
  readonly #turns: TurnLogEntry[] = [];
  readonly #chats: number[] = [];

  async getMeta(key: string) {
    return this.#meta.get(key);
  }
  async setMeta(key: string, value: string) {
    this.#meta.set(key, value);
  }

  async listTasks() {
    return [...this.#tasks.values()].sort(byOrder).map(copy);
  }
  async getTask(id: string) {
    const task = this.#tasks.get(id);
    return task && copy(task);
  }
  async countTasks() {
    return this.#tasks.size;
  }
  async insertTask(task: Task) {
    this.#tasks.set(task.id, copy(task));
  }
  async updateTask(id: string, patch: TaskPatch) {
    const task = this.#tasks.get(id);
    if (!task) return undefined;
    const next = { ...task, ...patch };
    this.#tasks.set(id, next);
    return copy(next);
  }
  async deleteTask(id: string) {
    if (!this.#tasks.has(id)) return [];
    const removed = [
      id,
      ...[...this.#tasks.values()].filter((t) => t.parentId === id).map((t) => t.id),
    ];
    for (const taskId of removed) this.#tasks.delete(taskId);
    return removed;
  }

  async listTimers() {
    return [...this.#timers.values()].sort((a, b) => a.createdAt - b.createdAt).map(copy);
  }
  async getTimer(id: string) {
    const timer = this.#timers.get(id);
    return timer && copy(timer);
  }
  async insertTimer(timer: CareTimer) {
    this.#timers.set(timer.id, copy(timer));
  }
  async updateTimer(id: string, patch: TimerPatch) {
    const timer = this.#timers.get(id);
    if (!timer) return undefined;
    const next = { ...timer, ...patch };
    this.#timers.set(id, next);
    return copy(next);
  }
  async deleteTimer(id: string) {
    this.#timerTasks.delete(id);
    return this.#timers.delete(id);
  }
  async getTimerTask(timerId: string) {
    return this.#timerTasks.get(timerId) ?? null;
  }
  async setTimerTask(timerId: string, taskId: number | null) {
    this.#timerTasks.set(timerId, taskId);
  }

  async getActiveSession() {
    const session = [...this.#sessions.values()].find((s) => s.status !== "ended");
    return session && copy(session);
  }
  async getLatestSession() {
    const session = [...this.#sessions.values()].sort((a, b) => b.startedAt - a.startedAt)[0];
    return session && copy(session);
  }
  async getSession(id: string) {
    const session = this.#sessions.get(id);
    return session && copy(session);
  }
  async insertSession(session: Session) {
    this.#sessions.set(session.id, copy(session));
    this.#sessionTasks.set(session.id, { guardTaskId: null, wrapUpTaskId: null, handoffAt: null });
  }
  async updateSession(id: string, patch: SessionPatch) {
    const session = this.#sessions.get(id);
    if (!session) return undefined;
    const next = { ...session, ...patch };
    this.#sessions.set(id, next);
    return copy(next);
  }
  async transitionSession(id: string, from: Session["status"], patch: SessionPatch) {
    if (this.#sessions.get(id)?.status !== from) return undefined;
    return this.updateSession(id, patch);
  }
  async getSessionTasks(id: string) {
    return {
      ...(this.#sessionTasks.get(id) ?? { guardTaskId: null, wrapUpTaskId: null, handoffAt: null }),
    };
  }
  async setSessionTasks(id: string, patch: Partial<SessionTasks>) {
    this.#sessionTasks.set(id, { ...(await this.getSessionTasks(id)), ...patch });
  }

  async insertNudge(nudge: Nudge) {
    if (await this.hasNudge(nudge.timerId, nudge.firedAt)) return false;
    this.#nudges.push(copy(nudge));
    return true;
  }
  async hasNudge(timerId: string, firedAt: number) {
    return this.#nudges.some((n) => n.timerId === timerId && n.firedAt === firedAt);
  }
  async listNudges(sessionId: string) {
    return this.#nudges.filter((n) => n.sessionId === sessionId).map(copy);
  }

  async claimHype(hype: Hype) {
    if (this.#hypes.has(hype.taskId)) return false;
    this.#hypes.set(hype.taskId, copy(hype));
    return true;
  }
  async getHype(taskId: string) {
    const hype = this.#hypes.get(taskId);
    return hype && copy(hype);
  }
  async setHypeMessage(taskId: string, message: string, source: TextSource) {
    const hype = this.#hypes.get(taskId);
    if (!hype) return undefined;
    const next = { ...hype, message, source };
    this.#hypes.set(taskId, next);
    return copy(next);
  }
  async listHypes(limit: number) {
    return [...this.#hypes.values()]
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-limit)
      .map(copy);
  }

  async listMemory() {
    return [...this.#memory.values()].sort((a, b) => a.createdAt - b.createdAt).map(copy);
  }
  async insertMemory(fact: MemoryFact) {
    this.#memory.set(fact.id, copy(fact));
  }
  async deleteMemory(id: string) {
    return this.#memory.delete(id);
  }

  async insertApproval(approval: Approval, waitTaskId: number | null) {
    if (this.#approvals.has(approval.id)) return false;
    this.#approvals.set(approval.id, { approval: copy(approval), waitTaskId });
    return true;
  }
  async getApproval(id: string) {
    const row = this.#approvals.get(id);
    return row && copy(row.approval);
  }
  async getApprovalWaitTask(id: string) {
    return this.#approvals.get(id)?.waitTaskId ?? null;
  }
  async setApprovalWaitTask(id: string, taskId: number) {
    const row = this.#approvals.get(id);
    if (row) row.waitTaskId = taskId;
  }
  async listApprovals(options: { status?: ApprovalStatus; limit: number }) {
    return [...this.#approvals.values()]
      .map((row) => row.approval)
      .filter((a) => options.status === undefined || a.status === options.status)
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-options.limit)
      .map(copy);
  }
  async transitionApproval(
    id: string,
    from: readonly ApprovalStatus[],
    patch: { status: ApprovalStatus; decidedAt?: number; result?: string | null },
  ) {
    const row = this.#approvals.get(id);
    if (!row || !from.includes(row.approval.status)) return undefined;
    row.approval = { ...row.approval, ...patch };
    return copy(row.approval);
  }

  async getPlan() {
    return this.#plan && copy(this.#plan);
  }
  async setPlan(plan: FocusPlan) {
    this.#plan = copy(plan);
  }

  async insertTurn(turn: TurnLogEntry) {
    this.#turns.push(copy(turn));
  }
  async listTurns(limit: number) {
    return this.#turns.slice(-limit).reverse().map(copy);
  }
  async tokensSince(since: number) {
    return this.#turns
      .filter((t) => t.at >= since)
      .reduce((sum, t) => sum + t.inputTokens + t.outputTokens, 0);
  }

  async recordChat(at: number, since: number) {
    this.#chats.push(at);
    return this.#chats.filter((t) => t >= since).length;
  }
}
