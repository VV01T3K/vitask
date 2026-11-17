import type { SqliteExecutor, SqliteValue } from "@earendil-works/pi-durable/storage/sqlite";
import type {
  SessionPatch,
  SessionTasks,
  TaskPatch,
  TimerPatch,
  WorkspaceStore,
} from "@vitask/coach";
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

type Row = Record<string, SqliteValue>;

type Cell = SqliteValue | undefined;
const num = (value: Cell): number => Number(value ?? 0);
const numOrNull = (value: Cell): number | null =>
  value === null || value === undefined ? null : Number(value);
const str = (value: Cell): string => String(value ?? "");
const strOrNull = (value: Cell): string | null =>
  value === null || value === undefined ? null : String(value);

// Rows come from tables this module creates, so their columns hold the protocol's values; the casts below narrow
// string columns to the protocol's enums without re-validating every read.
const toTask = (r: Row): Task => ({
  id: str(r.id),
  title: str(r.title),
  notes: str(r.notes),
  status: str(r.status) as Task["status"],
  parentId: strOrNull(r.parent_id),
  estimateMinutes: numOrNull(r.estimate_minutes),
  order: num(r.sort_order),
  createdAt: num(r.created_at),
  updatedAt: num(r.updated_at),
  completedAt: numOrNull(r.completed_at),
});

const toTimer = (r: Row): CareTimer => ({
  id: str(r.id),
  label: str(r.label),
  purpose: str(r.purpose),
  instructions: str(r.instructions),
  intervalSeconds: num(r.interval_seconds),
  enabled: num(r.enabled) === 1,
  icon: str(r.icon) as CareTimer["icon"],
  color: str(r.color),
  isDefault: num(r.is_default) === 1,
  nextFireAt: numOrNull(r.next_fire_at),
  createdAt: num(r.created_at),
  updatedAt: num(r.updated_at),
});

const toSession = (r: Row): Session => ({
  id: str(r.id),
  status: str(r.status) as Session["status"],
  startedAt: num(r.started_at),
  endedAt: numOrNull(r.ended_at),
  endReason: strOrNull(r.end_reason) as Session["endReason"],
  maxEndsAt: num(r.max_ends_at),
  debrief: strOrNull(r.debrief),
  debriefSource: strOrNull(r.debrief_source) as Session["debriefSource"],
});

const toNudge = (r: Row): Nudge => ({
  id: str(r.id),
  sessionId: str(r.session_id),
  timerId: str(r.timer_id),
  timerLabel: str(r.timer_label),
  message: str(r.message),
  source: str(r.source) as TextSource,
  firedAt: num(r.fired_at),
});

const toHype = (r: Row): Hype => ({
  taskId: str(r.task_id),
  taskTitle: str(r.task_title),
  sessionId: strOrNull(r.session_id),
  message: strOrNull(r.message),
  source: strOrNull(r.source) as TextSource | null,
  createdAt: num(r.created_at),
});

const toApproval = (r: Row): Approval => ({
  id: str(r.id),
  tool: str(r.tool) as Approval["tool"],
  args: JSON.parse(str(r.args_json)) as Approval["args"],
  summary: str(r.summary),
  status: str(r.status) as ApprovalStatus,
  createdAt: num(r.created_at),
  expiresAt: num(r.expires_at),
  decidedAt: numOrNull(r.decided_at),
  result: strOrNull(r.result),
});

const toTurn = (r: Row): TurnLogEntry => ({
  id: str(r.id),
  at: num(r.at),
  trigger: str(r.trigger) as TurnLogEntry["trigger"],
  conversationId: strOrNull(r.conversation_id),
  runId: strOrNull(r.run_id),
  provider: str(r.provider),
  model: str(r.model),
  inputTokens: num(r.input_tokens),
  outputTokens: num(r.output_tokens),
  cacheReadTokens: num(r.cache_read_tokens),
  costUsd: numOrNull(r.cost_usd),
  latencyMs: numOrNull(r.latency_ms),
  toolCalls: JSON.parse(str(r.tool_calls_json)) as string[],
  outcome: str(r.outcome) as TurnLogEntry["outcome"],
  error: strOrNull(r.error),
});

/** Column names of each patchable field; patches never interpolate caller-provided keys into SQL. */
const TASK_COLUMNS = {
  title: "title",
  notes: "notes",
  status: "status",
  estimateMinutes: "estimate_minutes",
  order: "sort_order",
  completedAt: "completed_at",
  updatedAt: "updated_at",
} as const satisfies Record<keyof TaskPatch, string>;

const TIMER_COLUMNS = {
  label: "label",
  purpose: "purpose",
  instructions: "instructions",
  intervalSeconds: "interval_seconds",
  enabled: "enabled",
  icon: "icon",
  color: "color",
  nextFireAt: "next_fire_at",
  updatedAt: "updated_at",
} as const satisfies Record<keyof TimerPatch, string>;

const SESSION_COLUMNS = {
  status: "status",
  endedAt: "ended_at",
  endReason: "end_reason",
  debrief: "debrief",
  debriefSource: "debrief_source",
} as const satisfies Record<keyof SessionPatch, string>;

const SESSION_TASK_COLUMNS = {
  guardTaskId: "guard_task_id",
  wrapUpTaskId: "wrap_up_task_id",
  handoffAt: "handoff_at",
} as const satisfies Record<keyof SessionTasks, string>;

function assignments(
  patch: Record<string, unknown>,
  columns: Record<string, string>,
): { sql: string; values: SqliteValue[] } {
  const sets: string[] = [];
  const values: SqliteValue[] = [];
  for (const [key, column] of Object.entries(columns)) {
    if (!(key in patch) || patch[key] === undefined) continue;
    const value = patch[key];
    sets.push(`${column} = ?`);
    values.push(typeof value === "boolean" ? (value ? 1 : 0) : (value as SqliteValue));
  }
  return { sql: sets.join(", "), values };
}

/** `WorkspaceStore` on the Durable Object's SQLite database, through the same queued adapter pi-durable uses. */
export class SqliteWorkspaceStore implements WorkspaceStore {
  readonly #db: SqliteExecutor;

  constructor(database: SqliteExecutor) {
    this.#db = database;
  }

  async getMeta(key: string) {
    return (
      strOrNull((await this.#db.get<Row>("SELECT value FROM meta WHERE key = ?", key))?.value) ??
      undefined
    );
  }
  async setMeta(key: string, value: string) {
    await this.#db.run(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      key,
      value,
    );
  }

  async listTasks() {
    return (await this.#db.all<Row>("SELECT * FROM tasks ORDER BY sort_order, created_at")).map(
      toTask,
    );
  }
  async getTask(id: string) {
    const row = await this.#db.get<Row>("SELECT * FROM tasks WHERE id = ?", id);
    return row && toTask(row);
  }
  async countTasks() {
    return num((await this.#db.get<Row>("SELECT COUNT(*) AS n FROM tasks"))?.n ?? 0);
  }
  async insertTask(t: Task) {
    await this.#db.run(
      `INSERT INTO tasks (id, title, notes, status, parent_id, estimate_minutes, sort_order, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      t.id,
      t.title,
      t.notes,
      t.status,
      t.parentId,
      t.estimateMinutes,
      t.order,
      t.createdAt,
      t.updatedAt,
      t.completedAt,
    );
  }
  async updateTask(id: string, patch: TaskPatch) {
    const { sql, values } = assignments(patch, TASK_COLUMNS);
    if (sql) await this.#db.run(`UPDATE tasks SET ${sql} WHERE id = ?`, ...values, id);
    return this.getTask(id);
  }
  async deleteTask(id: string) {
    const rows = await this.#db.all<Row>(
      "SELECT id FROM tasks WHERE id = ? OR parent_id = ? ORDER BY parent_id IS NOT NULL, sort_order",
      id,
      id,
    );
    if (!rows.some((r) => r.id === id)) return [];
    await this.#db.run("DELETE FROM tasks WHERE id = ? OR parent_id = ?", id, id);
    return rows.map((r) => str(r.id));
  }

  async listTimers() {
    return (await this.#db.all<Row>("SELECT * FROM care_timers ORDER BY created_at")).map(toTimer);
  }
  async getTimer(id: string) {
    const row = await this.#db.get<Row>("SELECT * FROM care_timers WHERE id = ?", id);
    return row && toTimer(row);
  }
  async insertTimer(t: CareTimer) {
    await this.#db.run(
      `INSERT INTO care_timers (id, label, purpose, instructions, interval_seconds, enabled, icon, color, is_default, next_fire_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      t.id,
      t.label,
      t.purpose,
      t.instructions,
      t.intervalSeconds,
      t.enabled ? 1 : 0,
      t.icon,
      t.color,
      t.isDefault ? 1 : 0,
      t.nextFireAt,
      t.createdAt,
      t.updatedAt,
    );
  }
  async updateTimer(id: string, patch: TimerPatch) {
    const { sql, values } = assignments(patch, TIMER_COLUMNS);
    if (sql) await this.#db.run(`UPDATE care_timers SET ${sql} WHERE id = ?`, ...values, id);
    return this.getTimer(id);
  }
  async deleteTimer(id: string) {
    return (await this.#db.runCounted("DELETE FROM care_timers WHERE id = ?", id)) > 0;
  }
  async getTimerTask(timerId: string) {
    return numOrNull(
      (await this.#db.get<Row>("SELECT task_id FROM care_timers WHERE id = ?", timerId))?.task_id ??
        null,
    );
  }
  async setTimerTask(timerId: string, taskId: number | null) {
    await this.#db.run("UPDATE care_timers SET task_id = ? WHERE id = ?", taskId, timerId);
  }

  async getActiveSession() {
    const row = await this.#db.get<Row>(
      "SELECT * FROM sessions WHERE status != 'ended' ORDER BY started_at DESC LIMIT 1",
    );
    return row && toSession(row);
  }
  async getLatestSession() {
    const row = await this.#db.get<Row>("SELECT * FROM sessions ORDER BY started_at DESC LIMIT 1");
    return row && toSession(row);
  }
  async getSession(id: string) {
    const row = await this.#db.get<Row>("SELECT * FROM sessions WHERE id = ?", id);
    return row && toSession(row);
  }
  async insertSession(s: Session) {
    await this.#db.run(
      `INSERT INTO sessions (id, status, started_at, ended_at, end_reason, max_ends_at, debrief, debrief_source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      s.id,
      s.status,
      s.startedAt,
      s.endedAt,
      s.endReason,
      s.maxEndsAt,
      s.debrief,
      s.debriefSource,
    );
  }
  async updateSession(id: string, patch: SessionPatch) {
    const { sql, values } = assignments(patch, SESSION_COLUMNS);
    if (sql) await this.#db.run(`UPDATE sessions SET ${sql} WHERE id = ?`, ...values, id);
    return this.getSession(id);
  }
  async transitionSession(id: string, from: Session["status"], patch: SessionPatch) {
    const { sql, values } = assignments(patch, SESSION_COLUMNS);
    const changed = await this.#db.runCounted(
      `UPDATE sessions SET ${sql} WHERE id = ? AND status = ?`,
      ...values,
      id,
      from,
    );
    return changed > 0 ? this.getSession(id) : undefined;
  }
  async getSessionTasks(id: string) {
    const row = await this.#db.get<Row>(
      "SELECT guard_task_id, wrap_up_task_id, handoff_at FROM sessions WHERE id = ?",
      id,
    );
    return {
      guardTaskId: numOrNull(row?.guard_task_id ?? null),
      wrapUpTaskId: numOrNull(row?.wrap_up_task_id ?? null),
      handoffAt: numOrNull(row?.handoff_at ?? null),
    };
  }
  async setSessionTasks(id: string, patch: Partial<SessionTasks>) {
    const { sql, values } = assignments(patch, SESSION_TASK_COLUMNS);
    if (sql) await this.#db.run(`UPDATE sessions SET ${sql} WHERE id = ?`, ...values, id);
  }

  async insertNudge(n: Nudge) {
    const changed = await this.#db.runCounted(
      `INSERT INTO nudges (id, session_id, timer_id, timer_label, message, source, fired_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (timer_id, fired_at) DO NOTHING`,
      n.id,
      n.sessionId,
      n.timerId,
      n.timerLabel,
      n.message,
      n.source,
      n.firedAt,
    );
    return changed > 0;
  }
  async hasNudge(timerId: string, firedAt: number) {
    return (
      (await this.#db.get<Row>(
        "SELECT 1 AS x FROM nudges WHERE timer_id = ? AND fired_at = ?",
        timerId,
        firedAt,
      )) !== undefined
    );
  }
  async listNudges(sessionId: string) {
    return (
      await this.#db.all<Row>(
        "SELECT * FROM nudges WHERE session_id = ? ORDER BY fired_at",
        sessionId,
      )
    ).map(toNudge);
  }

  async claimHype(h: Hype) {
    const changed = await this.#db.runCounted(
      `INSERT INTO hypes (task_id, task_title, session_id, message, source, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (task_id) DO NOTHING`,
      h.taskId,
      h.taskTitle,
      h.sessionId,
      h.message,
      h.source,
      h.createdAt,
    );
    return changed > 0;
  }
  async getHype(taskId: string) {
    const row = await this.#db.get<Row>("SELECT * FROM hypes WHERE task_id = ?", taskId);
    return row && toHype(row);
  }
  async setHypeMessage(taskId: string, message: string, source: TextSource) {
    await this.#db.run(
      "UPDATE hypes SET message = ?, source = ? WHERE task_id = ?",
      message,
      source,
      taskId,
    );
    return this.getHype(taskId);
  }
  async listHypes(limit: number) {
    const rows = await this.#db.all<Row>(
      "SELECT * FROM hypes ORDER BY created_at DESC LIMIT ?",
      limit,
    );
    return rows.map(toHype).reverse();
  }

  async listMemory(): Promise<MemoryFact[]> {
    const rows = await this.#db.all<Row>("SELECT * FROM memory_facts ORDER BY created_at, id");
    return rows.map((r) => ({ id: str(r.id), text: str(r.text), createdAt: num(r.created_at) }));
  }
  async insertMemory(fact: MemoryFact) {
    await this.#db.run(
      "INSERT INTO memory_facts (id, text, created_at) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING",
      fact.id,
      fact.text,
      fact.createdAt,
    );
  }
  async deleteMemory(id: string) {
    return (await this.#db.runCounted("DELETE FROM memory_facts WHERE id = ?", id)) > 0;
  }

  async insertApproval(a: Approval, waitTaskId: number | null) {
    const changed = await this.#db.runCounted(
      `INSERT INTO approvals (id, tool, args_json, summary, status, created_at, expires_at, decided_at, result, wait_task_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
      a.id,
      a.tool,
      JSON.stringify(a.args),
      a.summary,
      a.status,
      a.createdAt,
      a.expiresAt,
      a.decidedAt,
      a.result,
      waitTaskId,
    );
    return changed > 0;
  }
  async getApproval(id: string) {
    const row = await this.#db.get<Row>("SELECT * FROM approvals WHERE id = ?", id);
    return row && toApproval(row);
  }
  async getApprovalWaitTask(id: string) {
    return numOrNull(
      (await this.#db.get<Row>("SELECT wait_task_id FROM approvals WHERE id = ?", id))
        ?.wait_task_id ?? null,
    );
  }
  async setApprovalWaitTask(id: string, taskId: number) {
    await this.#db.run("UPDATE approvals SET wait_task_id = ? WHERE id = ?", taskId, id);
  }
  async listApprovals(options: { status?: ApprovalStatus; limit: number }) {
    const rows =
      options.status === undefined
        ? await this.#db.all<Row>(
            "SELECT * FROM approvals ORDER BY created_at DESC LIMIT ?",
            options.limit,
          )
        : await this.#db.all<Row>(
            "SELECT * FROM approvals WHERE status = ? ORDER BY created_at DESC LIMIT ?",
            options.status,
            options.limit,
          );
    return rows.map(toApproval).reverse();
  }
  async transitionApproval(
    id: string,
    from: readonly ApprovalStatus[],
    patch: { status: ApprovalStatus; decidedAt?: number; result?: string | null },
  ) {
    const { sql, values } = assignments(patch, {
      status: "status",
      decidedAt: "decided_at",
      result: "result",
    });
    const changed = await this.#db.runCounted(
      `UPDATE approvals SET ${sql} WHERE id = ? AND status IN (${from.map(() => "?").join(", ")})`,
      ...values,
      id,
      ...from,
    );
    return changed > 0 ? this.getApproval(id) : undefined;
  }

  async getPlan(): Promise<FocusPlan | undefined> {
    const row = await this.#db.get<Row>("SELECT * FROM plans ORDER BY created_at DESC LIMIT 1");
    if (!row) return undefined;
    return {
      id: str(row.id),
      blocks: JSON.parse(str(row.blocks_json)) as FocusPlan["blocks"],
      createdAt: num(row.created_at),
    };
  }
  async setPlan(plan: FocusPlan) {
    await this.#db.run(
      "INSERT INTO plans (id, blocks_json, created_at) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET blocks_json = excluded.blocks_json",
      plan.id,
      JSON.stringify(plan.blocks),
      plan.createdAt,
    );
  }

  async insertTurn(t: TurnLogEntry) {
    await this.#db.run(
      `INSERT INTO turn_log (id, at, trigger, conversation_id, run_id, provider, model, input_tokens, output_tokens, cache_read_tokens, cost_usd, latency_ms, tool_calls_json, outcome, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      t.id,
      t.at,
      t.trigger,
      t.conversationId,
      t.runId,
      t.provider,
      t.model,
      t.inputTokens,
      t.outputTokens,
      t.cacheReadTokens,
      t.costUsd,
      t.latencyMs,
      JSON.stringify(t.toolCalls),
      t.outcome,
      t.error,
    );
  }
  async listTurns(limit: number) {
    return (
      await this.#db.all<Row>("SELECT * FROM turn_log ORDER BY at DESC, rowid DESC LIMIT ?", limit)
    ).map(toTurn);
  }
  async tokensSince(since: number) {
    const row = await this.#db.get<Row>(
      "SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS n FROM turn_log WHERE at >= ?",
      since,
    );
    return num(row?.n ?? 0);
  }

  async recordChat(at: number, since: number) {
    await this.#db.run("DELETE FROM chat_events WHERE at < ?", since);
    await this.#db.run("INSERT INTO chat_events (at) VALUES (?)", at);
    return num(
      (await this.#db.get<Row>("SELECT COUNT(*) AS n FROM chat_events WHERE at >= ?", since))?.n ??
        0,
    );
  }
}
