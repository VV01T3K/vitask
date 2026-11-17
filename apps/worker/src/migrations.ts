import type { SqliteDatabase } from "@earendil-works/pi-durable/storage/sqlite";

/**
 * Host-table migrations, applied in order inside one transaction each. Append new versions; never edit a released
 * one. pi-durable migrates its own `pi_` tables when its storage opens.
 */
export const MIGRATIONS: readonly { version: number; statements: readonly string[] }[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
      `CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        notes TEXT NOT NULL,
        status TEXT NOT NULL,
        parent_id TEXT,
        estimate_minutes INTEGER,
        sort_order REAL NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER
      )`,
      `CREATE INDEX tasks_parent ON tasks (parent_id)`,
      `CREATE TABLE care_timers (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        purpose TEXT NOT NULL,
        instructions TEXT NOT NULL,
        interval_seconds INTEGER NOT NULL,
        enabled INTEGER NOT NULL,
        icon TEXT NOT NULL,
        color TEXT NOT NULL,
        is_default INTEGER NOT NULL,
        next_fire_at INTEGER,
        task_id INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        end_reason TEXT,
        max_ends_at INTEGER NOT NULL,
        debrief TEXT,
        debrief_source TEXT,
        guard_task_id INTEGER,
        wrap_up_task_id INTEGER,
        handoff_at INTEGER
      )`,
      `CREATE TABLE nudges (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        timer_id TEXT NOT NULL,
        timer_label TEXT NOT NULL,
        message TEXT NOT NULL,
        source TEXT NOT NULL,
        fired_at INTEGER NOT NULL,
        UNIQUE (timer_id, fired_at)
      )`,
      `CREATE INDEX nudges_session ON nudges (session_id, fired_at)`,
      `CREATE TABLE hypes (
        task_id TEXT PRIMARY KEY,
        task_title TEXT NOT NULL,
        session_id TEXT,
        message TEXT,
        source TEXT,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE memory_facts (id TEXT PRIMARY KEY, text TEXT NOT NULL, created_at INTEGER NOT NULL)`,
      `CREATE TABLE approvals (
        id TEXT PRIMARY KEY,
        tool TEXT NOT NULL,
        args_json TEXT NOT NULL,
        summary TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        decided_at INTEGER,
        result TEXT,
        wait_task_id INTEGER
      )`,
      `CREATE INDEX approvals_status ON approvals (status, created_at)`,
      `CREATE TABLE plans (id TEXT PRIMARY KEY, blocks_json TEXT NOT NULL, created_at INTEGER NOT NULL)`,
      `CREATE TABLE turn_log (
        id TEXT PRIMARY KEY,
        at INTEGER NOT NULL,
        trigger TEXT NOT NULL,
        conversation_id TEXT,
        run_id TEXT,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        cache_read_tokens INTEGER NOT NULL,
        cost_usd REAL,
        latency_ms INTEGER,
        tool_calls_json TEXT NOT NULL,
        outcome TEXT NOT NULL,
        error TEXT
      )`,
      `CREATE INDEX turn_log_at ON turn_log (at)`,
      `CREATE TABLE chat_events (at INTEGER NOT NULL)`,
      `CREATE INDEX chat_events_at ON chat_events (at)`,
    ],
  },
];

export async function migrate(database: SqliteDatabase): Promise<number> {
  await database.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
  const row = await database.get<{ version: number | null }>(
    "SELECT MAX(version) AS version FROM schema_migrations",
  );
  let current = row?.version ?? 0;
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    await database.transaction(async (tx) => {
      for (const statement of migration.statements) await tx.exec(statement);
      await tx.run(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
        migration.version,
        Date.now(),
      );
    });
    current = migration.version;
  }
  return current;
}
