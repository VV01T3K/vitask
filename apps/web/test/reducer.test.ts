import { describe, expect, it } from "vite-plus/test";

import { initialState, reduce } from "../src/state/reducer.ts";
import type { Action, State } from "../src/state/types.ts";
import { viewTasks, viewTimers } from "../src/state/view.ts";
import { approval, entry, nudge, session, snapshot, task, timer, turn } from "./fixtures.ts";

const run = (state: State, ...actions: Action[]) => actions.reduce(reduce, state);
const hello = (snap = snapshot()): Action => ({
  type: "message",
  message: { type: "hello", protocol: 1, snapshot: snap },
});
const event = (message: Extract<Action, { type: "message" }>["message"]): Action => ({
  type: "message",
  message,
});
const ready = (snap = snapshot()) => run(initialState, hello(snap));

describe("snapshot", () => {
  it("hello replaces the server state", () => {
    const state = run(ready(), hello(snapshot({ tasks: [] })));
    expect(state.server?.tasks).toEqual([]);
  });

  it("HTTP snapshot sets the clock offset", () => {
    const state = reduce(initialState, {
      type: "snapshot",
      snapshot: snapshot(),
      clockOffsetMs: 5_000,
    });
    expect(state.clockOffsetMs).toBe(5_000);
    expect(state.server).not.toBeNull();
  });

  it("events before the first snapshot are ignored (the hello covers them)", () => {
    const state = reduce(initialState, event({ type: "task.deleted", id: "t1" }));
    expect(state).toBe(initialState);
  });

  it("ack, error and pong leave the state alone", () => {
    const state = ready();
    expect(reduce(state, event({ type: "pong" }))).toBe(state);
    expect(reduce(state, event({ type: "ack", requestId: "r", result: null }))).toBe(state);
  });
});

describe("events", () => {
  it("task.upserted inserts and updates, ignoring an older copy", () => {
    let state = run(
      ready(),
      event({ type: "task.upserted", task: task({ id: "t2", title: "New" }) }),
    );
    expect(state.server?.tasks.map((t) => t.id)).toEqual(["t1", "t2"]);
    state = run(
      state,
      event({ type: "task.upserted", task: task({ title: "Renamed", updatedAt: 2_000 }) }),
    );
    expect(state.server?.tasks[0]?.title).toBe("Renamed");
    state = run(
      state,
      event({ type: "task.upserted", task: task({ title: "Stale", updatedAt: 1_500 }) }),
    );
    expect(state.server?.tasks[0]?.title).toBe("Renamed");
  });

  it("task.deleted removes the task and its steps", () => {
    const state = run(
      ready(snapshot({ tasks: [task(), task({ id: "s", parentId: "t1" }), task({ id: "x" })] })),
      event({ type: "task.deleted", id: "t1" }),
    );
    expect(state.server?.tasks.map((t) => t.id)).toEqual(["x"]);
  });

  it("timer.upserted and timer.deleted", () => {
    let state = run(
      ready(),
      event({ type: "timer.upserted", timer: timer({ nextFireAt: 9_000, updatedAt: 2_000 }) }),
    );
    expect(state.server?.timers[0]?.nextFireAt).toBe(9_000);
    state = run(
      state,
      event({ type: "nudge", nudge: nudge() }),
      event({ type: "timer.deleted", id: "w1" }),
    );
    expect(state.server?.timers).toEqual([]);
    expect(state.firing).toEqual({});
  });

  it("session.updated keeps nudges of the same session and clears them for a new one", () => {
    let state = run(
      ready(snapshot({ session: session(), nudges: [nudge()] })),
      event({ type: "session.updated", session: session({ status: "wrapping_up" }) }),
    );
    expect(state.server?.nudges).toHaveLength(1);
    state = run(state, event({ type: "session.updated", session: session({ id: "s2" }) }));
    expect(state.server?.nudges).toEqual([]);
  });

  it("nudge is recorded and waits on its timer until dismissed; ending the session clears it", () => {
    let state = run(
      ready(snapshot({ session: session() })),
      event({ type: "nudge", nudge: nudge() }),
    );
    expect(state.server?.nudges).toHaveLength(1);
    expect(state.firing.w1?.id).toBe("n1");
    expect(run(state, { type: "nudge.dismiss", timerId: "w1" }).firing).toEqual({});
    state = run(state, event({ type: "session.updated", session: session({ status: "ended" }) }));
    expect(state.firing).toEqual({});
  });

  it("hype replaces the earlier hype of the same task, newest first", () => {
    const pending = {
      taskId: "t1",
      taskTitle: "Write report",
      sessionId: null,
      message: null,
      source: null,
      createdAt: 1,
    };
    let state = run(ready(), event({ type: "hype", hype: pending }));
    state = run(state, event({ type: "hype", hype: { ...pending, taskId: "t2" } }));
    state = run(
      state,
      event({ type: "hype", hype: { ...pending, message: "Nice!", source: "ai" } }),
    );
    expect(state.server?.hypes.map((h) => [h.taskId, h.message])).toEqual([
      ["t1", "Nice!"],
      ["t2", null],
    ]);
  });

  it("approval.upserted inserts, updates and clears the pending decision once settled", () => {
    let state = run(ready(), event({ type: "approval.upserted", approval: approval() }));
    state = run(state, { type: "decision.begin", approvalId: "a1", decision: "approve" });
    expect(state.decisions.a1).toEqual({ decision: "approve", error: null });
    state = run(
      state,
      event({ type: "approval.upserted", approval: approval({ status: "approved" }) }),
    );
    expect(state.server?.approvals).toHaveLength(1);
    expect(state.server?.approvals[0]?.status).toBe("approved");
    expect(state.decisions).toEqual({});
  });

  it("memory.updated, plan.updated and budget.updated replace their part", () => {
    const memory = [{ id: "m1", text: "Likes short breaks", createdAt: 1 }];
    const plan = {
      id: "p1",
      blocks: [{ taskId: "t1", title: "Write report", minutes: 25, note: null }],
      createdAt: 1,
    };
    const budget = { dailyTokenLimit: 100, tokensUsedToday: 50, chatPerMinute: 10 };
    const state = run(
      ready(),
      event({ type: "memory.updated", memory }),
      event({ type: "plan.updated", plan }),
      event({ type: "budget.updated", budget }),
    );
    expect(state.server?.memory).toEqual(memory);
    expect(state.server?.plan).toEqual(plan);
    expect(state.server?.budget).toEqual(budget);
  });

  it("coach.entry appends once, in order", () => {
    const state = run(
      ready(),
      event({ type: "coach.entry", entry: entry({ id: 1 }) }),
      event({ type: "coach.entry", entry: entry({ id: 2, role: "assistant", text: "Hello" }) }),
      event({ type: "coach.entry", entry: entry({ id: 2, role: "assistant", text: "dup" }) }),
    );
    expect(state.server?.coach.entries.map((e) => e.text)).toEqual(["hi", "Hello"]);
  });

  it("coach.live replaces the live state", () => {
    const live = { busy: true, partialText: "Thinking about", tools: [], failure: null };
    expect(run(ready(), event({ type: "coach.live", live })).server?.coach.live).toEqual(live);
  });

  it("turn.logged prepends once, also before the turns were loaded", () => {
    const state = run(
      initialState,
      event({ type: "turn.logged", turn: turn() }),
      event({ type: "turn.logged", turn: turn() }),
    );
    expect(state.turns).toHaveLength(1);
    const loaded = run(state, { type: "turns.loaded", turns: [turn({ id: "old", at: 1 })] });
    expect(loaded.turns.map((t) => t.id)).toEqual(["turn1", "old"]);
    expect(loaded.turnsLoaded).toBe(true);
  });
});

describe("optimistic ops", () => {
  const created = task({ id: "tmp-1", title: "Draft", order: Number.MAX_SAFE_INTEGER });

  it("shows a created task at once and swaps in the server's copy on commit", () => {
    let state = run(ready(), {
      type: "op.begin",
      op: { id: "o1", kind: "task.create", task: created },
    });
    expect(viewTasks(state).map((t) => t.id)).toEqual(["t1", "tmp-1"]);
    state = run(state, {
      type: "op.commit",
      opId: "o1",
      result: { task: task({ id: "t9", title: "Draft" }) },
    });
    expect(viewTasks(state).map((t) => t.id)).toEqual(["t1", "t9"]);
    expect(state.ops).toEqual([]);
  });

  it("rolls back a failed create, patch and delete", () => {
    const base = ready();
    for (const op of [
      { id: "o", kind: "task.create", task: created },
      { id: "o", kind: "task.patch", taskId: "t1", patch: { status: "done" } },
      { id: "o", kind: "task.delete", taskId: "t1" },
      { id: "o", kind: "timer.patch", timerId: "w1", patch: { enabled: false } },
      { id: "o", kind: "timer.delete", timerId: "w1" },
    ] as const) {
      const during = run(base, { type: "op.begin", op });
      expect([viewTasks(during), viewTimers(during)]).not.toEqual([
        viewTasks(base),
        viewTimers(base),
      ]);
      const after = run(during, { type: "op.rollback", opId: "o" });
      expect(viewTasks(after)).toEqual(viewTasks(base));
      expect(viewTimers(after)).toEqual(viewTimers(base));
    }
  });

  it("keeps an in-flight op over a fresh snapshot (a reconnect mid-request)", () => {
    const state = run(
      ready(),
      { type: "op.begin", op: { id: "o", kind: "task.delete", taskId: "t1" } },
      hello(),
    );
    expect(viewTasks(state)).toEqual([]);
  });

  it("commits deletes into the server state", () => {
    const state = run(
      ready(),
      { type: "op.begin", op: { id: "o", kind: "timer.delete", timerId: "w1" } },
      { type: "op.commit", opId: "o", result: { deletedTimerId: "w1" } },
    );
    expect(state.server?.timers).toEqual([]);
  });
});

describe("chats", () => {
  it("a chat is sending, then queued, then gone when its user entry arrives", () => {
    let state = run(
      ready(
        snapshot({ coach: { ...snapshot().coach, entries: [entry({ id: 4, text: "hello" })] } }),
      ),
      {
        type: "chat.begin",
        requestId: "r1",
        text: "hello",
      },
    );
    expect(state.chats[0]).toMatchObject({ status: "sending", afterEntryId: 4 });
    state = run(state, { type: "chat.accepted", requestId: "r1" });
    expect(state.chats[0]?.status).toBe("accepted");
    // An older entry with the same text does not count.
    state = run(
      state,
      event({ type: "coach.entry", entry: entry({ id: 5, role: "assistant", text: "hello" }) }),
    );
    expect(state.chats).toHaveLength(1);
    state = run(state, event({ type: "coach.entry", entry: entry({ id: 6, text: "hello" }) }));
    expect(state.chats).toEqual([]);
  });

  it("a resync that already contains the message clears it", () => {
    let state = run(ready(), { type: "chat.begin", requestId: "r1", text: "plan my day" });
    state = run(
      state,
      hello(
        snapshot({
          coach: { ...snapshot().coach, entries: [entry({ id: 1, text: "plan my day" })] },
        }),
      ),
    );
    expect(state.chats).toEqual([]);
  });

  it("a refused chat keeps its error until dismissed", () => {
    const error = { code: "rate_limited" as const, message: "slow down", retryAfterMs: 5_000 };
    let state = run(
      ready(),
      { type: "chat.begin", requestId: "r1", text: "x" },
      { type: "chat.failed", requestId: "r1", error },
    );
    expect(state.chats[0]).toMatchObject({ status: "failed", error });
    state = run(state, hello());
    expect(state.chats).toHaveLength(1);
    expect(run(state, { type: "chat.dismiss", requestId: "r1" }).chats).toEqual([]);
  });
});

describe("decisions and connection", () => {
  it("a failed decision keeps its error; a resync drops settled ones", () => {
    let state = run(ready(snapshot({ approvals: [approval()] })), {
      type: "decision.begin",
      approvalId: "a1",
      decision: "reject",
    });
    state = run(state, {
      type: "decision.failed",
      approvalId: "a1",
      error: { code: "network", message: "lost" },
    });
    expect(state.decisions.a1?.error?.code).toBe("network");
    state = run(state, { type: "decision.begin", approvalId: "a1", decision: "approve" });
    state = run(state, hello(snapshot({ approvals: [approval({ status: "expired" })] })));
    expect(state.decisions).toEqual({});
  });

  it("tracks the connection state", () => {
    const state = run(initialState, {
      type: "connection",
      connection: { status: "reconnecting", attempt: 2, retryAt: 10 },
    });
    expect(state.connection).toEqual({ status: "reconnecting", attempt: 2, retryAt: 10 });
  });
});
