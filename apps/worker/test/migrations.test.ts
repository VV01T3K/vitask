import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { getMigrations } from "better-auth/db/migration";
import { describe, expect, it } from "vite-plus/test";

import { authOptions } from "../src/auth.ts";
import { MIGRATIONS } from "../src/dev-migrations.ts";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");

describe("D1 migrations", () => {
  it("the dev applier lists every migration file, in order", () => {
    const files = readdirSync(dir)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    expect(MIGRATIONS.map(([name]) => name)).toEqual(files);
    for (const [name, sql] of MIGRATIONS) expect(sql).toBe(readFileSync(join(dir, name), "utf8"));
  });

  it("leave nothing for Better Auth to create or add (the schema matches the auth options)", async () => {
    const db = new DatabaseSync(":memory:");
    for (const [, sql] of MIGRATIONS) db.exec(sql);
    const options = authOptions(
      {
        appUrl: "http://localhost",
        secret: "test-secret-0123456789abcdef0123456789",
        cookieSecret: "test",
        extraOrigins: [],
      },
      db,
    );
    const { toBeCreated, toBeAdded } = await getMigrations(options);
    expect({ toBeCreated, toBeAdded }).toEqual({ toBeCreated: [], toBeAdded: [] });
  });
});
