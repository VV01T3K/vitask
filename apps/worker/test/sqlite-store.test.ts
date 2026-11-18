import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { SqliteStorage } from "@earendil-works/pi-durable/storage/sqlite";
import { openNodeSqliteDatabase } from "@earendil-works/pi-durable/storage/sqlite/node";
import { CoachRuntime } from "@vitask/coach";
import { describe, expect, it } from "vite-plus/test";

import { migrate, MIGRATIONS } from "../src/migrations.ts";
import { SqliteWorkspaceStore } from "../src/sqlite-store.ts";

async function database() {
  const db = await openNodeSqliteDatabase(":memory:");
  await migrate(db);
  return db;
}

const approval = {
  id: "apr_1",
  tool: "add_task" as const,
  args: { title: "x" },
  summary: 'Add task "x"',
  status: "pending" as const,
  createdAt: 1,
  expiresAt: 2,
  decidedAt: null,
  result: null,
};

describe("migrations", () => {
  it("applies each version once", async () => {
    const db = await openNodeSqliteDatabase(":memory:");
    expect(await migrate(db)).toBe(MIGRATIONS.at(-1)!.version);
    expect(await migrate(db)).toBe(MIGRATIONS.at(-1)!.version);
    const rows = await db.all<{ version: number }>("SELECT version FROM schema_migrations");
    expect(rows).toHaveLength(MIGRATIONS.length);
  });
});

describe("SqliteWorkspaceStore", () => {
  it("round-trips tasks and deletes steps with their parent", async () => {
    const store = new SqliteWorkspaceStore(await database());
    const base = {
      notes: "",
      status: "open" as const,
      estimateMinutes: 15,
      order: 1,
      createdAt: 1,
      updatedAt: 1,
      completedAt: null,
    };
    await store.insertTask({ ...base, id: "p", title: "Parent", parentId: null });
    await store.insertTask({ ...base, id: "c", title: "Child", parentId: "p", order: 2 });
    expect(await store.getTask("c")).toEqual({
      ...base,
      id: "c",
      title: "Child",
      parentId: "p",
      order: 2,
    });
    expect(
      await store.updateTask("p", { status: "done", completedAt: 5, updatedAt: 5 }),
    ).toMatchObject({ status: "done", completedAt: 5 });
    expect(await store.countTasks()).toBe(2);
    expect(await store.deleteTask("p")).toEqual(["p", "c"]);
    expect(await store.deleteTask("p")).toEqual([]);
  });

  it("guards duplicates and conditional transitions in SQL", async () => {
    const store = new SqliteWorkspaceStore(await database());
    expect(await store.insertApproval(approval, null)).toBe(true);
    expect(await store.insertApproval(approval, null)).toBe(false);
    await store.setApprovalWaitTask("apr_1", 9);
    expect(await store.getApprovalWaitTask("apr_1")).toBe(9);
    expect(
      await store.transitionApproval("apr_1", ["pending"], { status: "approved", decidedAt: 3 }),
    ).toMatchObject({
      status: "approved",
      decidedAt: 3,
      args: { title: "x" },
    });
    expect(
      await store.transitionApproval("apr_1", ["pending"], { status: "rejected" }),
    ).toBeUndefined();

    const nudge = {
      id: "n1",
      sessionId: "s",
      timerId: "t",
      timerLabel: "L",
      message: "m",
      source: "ai" as const,
      firedAt: 7,
    };
    expect(await store.insertNudge(nudge)).toBe(true);
    expect(await store.insertNudge({ ...nudge, id: "n2" })).toBe(false);
    expect(await store.hasNudge("t", 7)).toBe(true);

    const hype = {
      taskId: "t",
      taskTitle: "T",
      sessionId: null,
      message: null,
      source: null,
      createdAt: 1,
    };
    expect(await store.claimHype(hype)).toBe(true);
    expect(await store.claimHype(hype)).toBe(false);
    expect(await store.setHypeMessage("t", "yay", "ai")).toMatchObject({
      message: "yay",
      source: "ai",
    });
  });

  it("tracks sessions, timers, budget and chat rate", async () => {
    const store = new SqliteWorkspaceStore(await database());
    await store.insertSession({
      id: "s",
      status: "active",
      startedAt: 1,
      endedAt: null,
      endReason: null,
      maxEndsAt: 9,
      debrief: null,
      debriefSource: null,
    });
    expect(
      await store.transitionSession("s", "active", {
        status: "wrapping_up",
        endedAt: 4,
        endReason: "user",
      }),
    ).toMatchObject({ status: "wrapping_up" });
    expect(await store.transitionSession("s", "active", { status: "wrapping_up" })).toBeUndefined();
    await store.setSessionTasks("s", { wrapUpTaskId: 3 });
    expect(await store.getSessionTasks("s")).toEqual({
      guardTaskId: null,
      wrapUpTaskId: 3,
      handoffAt: null,
    });

    await store.insertTimer({
      id: "tm",
      label: "Water",
      purpose: "",
      instructions: "",
      intervalSeconds: 60,
      enabled: true,
      icon: "hydration",
      color: "#4f8fea",
      isDefault: true,
      nextFireAt: null,
      createdAt: 1,
      updatedAt: 1,
    });
    expect(await store.updateTimer("tm", { enabled: false, updatedAt: 2 })).toMatchObject({
      enabled: false,
      isDefault: true,
    });
    await store.setTimerTask("tm", 12);
    expect(await store.getTimerTask("tm")).toBe(12);

    const turn = {
      id: "a",
      at: 100,
      trigger: "chat" as const,
      conversationId: "1",
      runId: "r",
      provider: "groq",
      model: "m",
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 0,
      costUsd: 0.001,
      latencyMs: 30,
      toolCalls: ["list_tasks"],
      outcome: "ok" as const,
      error: null,
    };
    await store.insertTurn(turn);
    await store.insertTurn({ ...turn, id: "b", at: 50 });
    expect(await store.tokensSince(60)).toBe(15);
    expect((await store.listTurns(5)).map((t) => t.id)).toEqual(["a", "b"]);
    expect((await store.listTurns(5))[0]?.toolCalls).toEqual(["list_tasks"]);

    expect(await store.recordChat(1_000, 0)).toBe(1);
    expect(await store.recordChat(2_000, 0)).toBe(2);
    expect(await store.recordChat(70_000, 10_000)).toBe(1);
  });
});

describe("coach on SQLite", () => {
  it("runs an approved tool call with pi tables and host tables in one database", async () => {
    const db = await database();
    const faux = fauxProvider({ provider: "faux", models: [{ id: "coach", reasoning: false }] });
    const models = createModels();
    models.setProvider(faux.provider);
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall("add_task", { title: "From SQLite" })], {
        stopReason: "toolUse",
      }),
      fauxAssistantMessage("Done."),
    ]);
    const store = new SqliteWorkspaceStore(db);
    const runtime = await CoachRuntime.open({
      storage: await SqliteStorage.open(db, { prefix: "pi_" }),
      store,
      models,
      config: { provider: "faux", model: "coach", thinkingLevel: "off" },
    });
    runtime.resume();
    await runtime.chat("add it", "request-sqlite-1");
    let pending;
    for (let i = 0; i < 200 && !pending; i++) {
      pending = (await store.listApprovals({ status: "pending", limit: 1 }))[0];
      if (!pending) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await runtime.decideApproval(pending!.id, "approve");
    await runtime.waitForCoachIdle();
    expect((await store.listTasks()).map((t) => t.title)).toContain("From SQLite");
    const tables = await db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'pi_%'",
    );
    expect(tables.length).toBeGreaterThan(0);
    await runtime.close();
  });
});
