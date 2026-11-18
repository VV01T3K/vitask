import { BACKGROUND_CONTEXT as BACKGROUND } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import type { JsonObject } from "@earendil-works/pi-durable";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { CoachError } from "../src/errors.ts";
import type { CoachRuntime } from "../src/runtime.ts";
import { createTestCoach, waitFor } from "./helpers.ts";

const toolUse = (name: string, args: JsonObject) =>
  fauxAssistantMessage([fauxToolCall(name, args)], { stopReason: "toolUse" });

let open: CoachRuntime[] = [];
async function coach(config?: Parameters<typeof createTestCoach>[0]) {
  const test = await createTestCoach(config);
  open.push(test.runtime);
  return test;
}
afterEach(async () => {
  await Promise.all(open.map((runtime) => runtime.close()));
  open = [];
});

describe("approval gate", () => {
  it("applies a proposed change only after the user approves it", async () => {
    const { runtime, store, events, chat } = await coach();
    chat.push(
      toolUse("add_task", { title: "Write report", estimateMinutes: 30 }),
      fauxAssistantMessage("Added it."),
    );

    await runtime.chat("Add a task to write the report", "request-0001");
    const pending = await waitFor(
      async () => (await store.listApprovals({ status: "pending", limit: 5 }))[0],
    );
    expect(pending.tool).toBe("add_task");
    expect(pending.summary).toBe('Add task "Write report" (30 min)');
    expect((await store.listTasks()).some((t) => t.title === "Write report")).toBe(false);

    await runtime.decideApproval(pending.id, "approve");
    await runtime.waitForCoachIdle();

    const task = (await store.listTasks()).find((t) => t.title === "Write report");
    expect(task?.estimateMinutes).toBe(30);
    expect((await store.getApproval(pending.id))?.status).toBe("applied");
    const entries = events.flatMap((e) => (e.type === "coach.entry" ? [e.entry] : []));
    expect(entries.find((e) => e.role === "tool")?.text).toContain("The user approved");
    expect(entries.at(-1)).toMatchObject({ role: "assistant", text: "Added it." });
    expect(
      events.some((e) => e.type === "approval.upserted" && e.approval.status === "pending"),
    ).toBe(true);
  });

  it("tells the coach when the user rejects, and changes nothing", async () => {
    const { runtime, store, events, chat } = await coach();
    const [task] = await store
      .listTasks()
      .then(async () => [await runtime.createTask({ title: "Keep me" })]);
    chat.push(toolUse("delete_task", { taskId: task!.id }), fauxAssistantMessage("Okay, kept it."));

    await runtime.chat("Delete it", "request-0002");
    const pending = await waitFor(
      async () => (await store.listApprovals({ status: "pending", limit: 5 }))[0],
    );
    expect(pending.summary).toBe('Delete "Keep me"');
    await runtime.decideApproval(pending.id, "reject");
    await runtime.waitForCoachIdle();

    expect(await store.getTask(task!.id)).toBeDefined();
    const toolResult = events.flatMap((e) =>
      e.type === "coach.entry" && e.entry.role === "tool" ? [e.entry] : [],
    )[0];
    expect(toolResult).toMatchObject({ isError: true });
    expect(toolResult?.text).toContain("rejected");
    await expect(runtime.decideApproval(pending.id, "approve")).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("expires an unanswered proposal and blocks the change", async () => {
    const { runtime, store, chat } = await coach({ approvalTtlMs: 150 });
    chat.push(
      toolUse("add_task", { title: "Never added" }),
      fauxAssistantMessage("No answer, so I left it."),
    );

    await runtime.chat("Add something", "request-0003");
    await waitFor(async () => (await store.listApprovals({ status: "pending", limit: 5 }))[0]);
    await runtime.waitForCoachIdle();

    const [approval] = await store.listApprovals({ limit: 5 });
    expect(approval?.status).toBe("expired");
    expect((await store.listTasks()).some((t) => t.title === "Never added")).toBe(false);
  });

  it("refuses calls with unknown ids before asking the user", async () => {
    const { runtime, store, events, chat } = await coach();
    chat.push(
      toolUse("complete_task", { taskId: "task_missing" }),
      fauxAssistantMessage("That task does not exist."),
    );

    await runtime.chat("Complete task_missing", "request-0004");
    await runtime.waitForCoachIdle();

    expect(await store.listApprovals({ limit: 5 })).toEqual([]);
    const toolResult = events.find((e) => e.type === "coach.entry" && e.entry.role === "tool");
    expect(toolResult?.type === "coach.entry" && toolResult.entry.text).toContain(
      "No task with id task_missing",
    );
  });

  it("runs a break-down with idempotent step ids", async () => {
    const { runtime, store, chat } = await coach();
    const parent = await runtime.createTask({ title: "Launch" });
    chat.push(
      toolUse("break_down_task", {
        taskId: parent.id,
        steps: [{ title: "Draft" }, { title: "Ship", estimateMinutes: 15 }],
      }),
      fauxAssistantMessage("Split it."),
    );
    await runtime.chat("Break it down", "request-0005");
    const pending = await waitFor(
      async () => (await store.listApprovals({ status: "pending", limit: 5 }))[0],
    );
    await runtime.decideApproval(pending.id, "approve");
    await runtime.waitForCoachIdle();

    const steps = (await store.listTasks()).filter((t) => t.parentId === parent.id);
    expect(steps.map((s) => s.title)).toEqual(["Draft", "Ship"]);
    expect(steps.every((s) => s.id.startsWith(`task_${pending.id}`))).toBe(true);
  });
});

describe("memory", () => {
  it("remembers without approval and puts facts in the system prompt as data", async () => {
    const { runtime, store, chat, systemPrompts } = await coach();
    chat.push(
      toolUse("remember", { fact: "Prefers 25 minute focus blocks" }),
      fauxAssistantMessage("Noted."),
      fauxAssistantMessage("Hi again."),
    );
    await runtime.chat("Remember I like 25 minute blocks", "request-0006");
    await runtime.waitForCoachIdle();
    expect((await store.listMemory()).map((m) => m.text)).toEqual([
      "Prefers 25 minute focus blocks",
    ]);
    expect(await store.listApprovals({ limit: 5 })).toEqual([]);

    await runtime.chat("Hello", "request-0007");
    await runtime.waitForCoachIdle();
    const last = systemPrompts.at(-1) ?? "";
    expect(last).toContain(
      '<user_data source="memory">\n["Prefers 25 minute focus blocks"]\n</user_data>',
    );
    expect(last).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe("budgets and limits", () => {
  it("refuses chat over the daily budget and falls back for hype", async () => {
    const { runtime, store } = await coach({ dailyTokenBudget: 10 });
    await store.insertTurn({
      id: "turn_seed",
      at: Date.now(),
      trigger: "chat",
      conversationId: null,
      runId: null,
      provider: "faux",
      model: "coach",
      inputTokens: 20,
      outputTokens: 0,
      cacheReadTokens: 0,
      costUsd: 0,
      latencyMs: 1,
      toolCalls: [],
      outcome: "ok",
      error: null,
    });

    const refusal = await runtime.chat("hi", "request-0008").catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(CoachError);
    expect(refusal).toMatchObject({ code: "budget_exhausted" });
    expect((refusal as CoachError).retryAfterMs).toBeGreaterThan(0);

    const task = await runtime.createTask({ title: "Small win" });
    await runtime.completeTask(task.id);
    const hype = await waitFor(async () => (await store.getHype(task.id))?.message ?? undefined);
    expect(hype).toBe('Task cleared: "Small win". Momentum secured.');
    expect((await store.listTurns(5))[0]?.outcome).toBe("budget_exhausted");
  });

  it("rate-limits chat submissions per minute", async () => {
    const { runtime } = await coach({ chatPerMinute: 2 });
    await runtime.chat("one", "request-0009");
    await runtime.chat("two", "request-0010");
    await expect(runtime.chat("three", "request-0011")).rejects.toMatchObject({
      code: "rate_limited",
    });
  });

  it("logs one turn per model request with usage", async () => {
    const { runtime, store, chat } = await coach();
    chat.push(toolUse("list_tasks", {}), fauxAssistantMessage("You have no tasks."));
    await runtime.chat("What is on my list?", "request-0012");
    await runtime.waitForCoachIdle();
    const turns = await store.listTurns(10);
    expect(turns).toHaveLength(2);
    expect(
      turns.every((t) => t.trigger === "chat" && t.provider === "faux" && t.outcome === "ok"),
    ).toBe(true);
    expect(turns[1]?.toolCalls).toEqual(["list_tasks"]);
    expect(turns[0]?.inputTokens).toBeGreaterThan(0);
    expect(turns[0]?.runId).toBe(turns[1]?.runId);
  });
});

describe("tasks and hype", () => {
  it("creates a task under the client's id, once", async () => {
    const { runtime, store } = await coach();
    const first = await runtime.createTask({ id: "task_client123", title: "Mine" });
    const retry = await runtime.createTask({ id: "task_client123", title: "Mine" });
    expect(first.id).toBe("task_client123");
    expect(retry).toEqual(first);
    expect((await store.listTasks()).filter((t) => t.title === "Mine")).toHaveLength(1);
  });

  it("hypes a directly completed task once", async () => {
    const { runtime, store, events } = await coach();
    const task = await runtime.createTask({ title: "Inbox zero" });
    await runtime.completeTask(task.id);
    await runtime.updateTask(task.id, { status: "open" });
    await runtime.completeTask(task.id);
    await waitFor(async () => (await store.getHype(task.id))?.message ?? undefined);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(events.filter((e) => e.type === "hype")).toHaveLength(1);
    expect((await store.getHype(task.id))?.source).toBe("ai");
    expect((await store.listTurns(10)).filter((t) => t.trigger === "hype")).toHaveLength(1);
  });

  it("seeds the v1 default timers once", async () => {
    const { store } = await coach();
    expect((await store.listTimers()).map((t) => t.label)).toEqual([
      "Hydration",
      "Eye Rest (20-20-20)",
    ]);
  });
});

describe("sessions", () => {
  it("fires care-timer nudges on the server and re-arms", async () => {
    const { runtime, store, events } = await coach();
    for (const timer of await store.listTimers())
      await runtime.updateTimer(timer.id, { enabled: false });
    const timer = await runtime.createTimer({ label: "Stretch", intervalSeconds: 1 });
    const session = await runtime.startSession();

    const nudges = await waitFor(async () => {
      const list = await store.listNudges(session.id);
      return list.length >= 2 ? list : undefined;
    }, 4_000);
    expect(nudges[0]).toMatchObject({
      timerId: timer.id,
      message: "Nudge: sip some water.",
      source: "ai",
    });
    expect(nudges[1]!.firedAt - nudges[0]!.firedAt).toBeGreaterThanOrEqual(1_000);
    expect(events.filter((e) => e.type === "nudge").length).toBeGreaterThanOrEqual(2);
    expect((await store.getTimer(timer.id))?.nextFireAt).toBeGreaterThan(nudges[1]!.firedAt);
  });

  it("wraps up from real history and hands the coach a fresh context", async () => {
    const { runtime, store, chat, systemPrompts } = await coach();
    const session = await runtime.startSession();
    const task = await runtime.createTask({ title: "Refactor billing" });
    await runtime.completeTask(task.id);
    chat.push(toolUse("add_task", { title: "Left pending" }));
    await runtime.chat("Add one more", "request-0013");
    const pending = await waitFor(
      async () => (await store.listApprovals({ status: "pending", limit: 5 }))[0],
    );

    const ended = await runtime.endSession();
    expect(ended).toMatchObject({
      status: "ended",
      endReason: "user",
      debrief: "Debrief: a calm, solid session.",
    });
    expect((await store.getApproval(pending.id))?.status).toBe("expired");
    expect((await store.listTimers()).every((t) => t.nextFireAt === null)).toBe(true);
    await runtime.waitForCoachIdle();

    chat.push(fauxAssistantMessage("Fresh start."));
    await runtime.chat("Hi", "request-0014");
    await runtime.waitForCoachIdle();
    expect(systemPrompts.length).toBeGreaterThan(0);
    const context = await runtime.harness.root(BACKGROUND).then((root) => root.context(BACKGROUND));
    const firstUser = context.messages.find((m) => m.role === "user");
    expect(JSON.stringify(firstUser)).toContain("Handoff from the previous focus session");
    expect(JSON.stringify(firstUser)).toContain("Refactor billing");
    expect(session.id).toBe(ended.id);
  });

  it("ends a session by itself at the maximum length", async () => {
    const { runtime, store } = await coach({ maxSessionMs: 300 });
    const session = await runtime.startSession();
    const ended = await waitFor(async () => {
      const current = await store.getSession(session.id);
      return current?.status === "ended" ? current : undefined;
    }, 4_000);
    expect(ended.endReason).toBe("max_length");
    expect(ended.debrief).toBeTruthy();
  });

  it("refuses intervals below the configured minimum", async () => {
    const { runtime } = await coach({ minTimerIntervalSeconds: 60 });
    await expect(
      runtime.createTimer({ label: "Too fast", intervalSeconds: 5 }),
    ).rejects.toMatchObject({
      code: "bad_request",
    });
  });
});
