// WORKAROUND for celld 0.6.3 (development only). `celld d1 migrations apply` reaches a database only through a fleet
// bucket, and `celld dev` keeps D1 in its local store, which no operator command can reach ("The local object store
// is not available to a fleet node or an operator subcommand"). With D1_DEV_MIGRATIONS=apply, which only .dev.vars
// and the test harnesses set, the Worker applies migrations/ itself, recording them in the same `d1_migrations` table
// that wrangler and `celld d1 migrations apply` use. Deployed Workers never set it. Remove this file when celld can
// migrate a `celld dev` database.
import betterAuth0001 from "../migrations/0001_better_auth.sql";

/** Every file in migrations/, in order (a unit test keeps this list in step with the directory). */
export const MIGRATIONS: readonly (readonly [name: string, sql: string])[] = [
  ["0001_better_auth.sql", betterAuth0001],
];

const BOOKKEEPING = `CREATE TABLE IF NOT EXISTS d1_migrations(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
)`;

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** Applies the migrations the database has not recorded yet, each in one transaction with its record. */
async function applied(db: D1Database): Promise<Set<string>> {
  const { results } = await db.prepare("SELECT name FROM d1_migrations").all<{ name: string }>();
  return new Set(results.map((row) => row.name));
}

/**
 * Applies the migrations the database has not recorded yet, each in one transaction with its record. Requests on a
 * cold Worker may run this at the same time; the loser's transaction rolls back, and it finds the migration recorded.
 */
export async function applyDevMigrations(db: D1Database): Promise<void> {
  await db.exec(BOOKKEEPING.replaceAll("\n", " "));
  const done = await applied(db);
  for (const [name, sql] of MIGRATIONS) {
    if (done.has(name)) continue;
    try {
      await db.exec(`${sql}\nINSERT INTO d1_migrations (name) VALUES (${quote(name)});`);
    } catch (error) {
      if (!(await applied(db)).has(name)) throw error;
    }
  }
}
