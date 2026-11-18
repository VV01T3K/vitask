import { describe, expect, it } from "vite-plus/test";

import { createActions } from "../src/state/actions.ts";
import { RequestFailed, type http } from "../src/state/api.ts";
import { createStore } from "../src/state/store.ts";
import type { UiError } from "../src/state/types.ts";
import { viewTasks } from "../src/state/view.ts";
import { snapshot, task } from "./fixtures.ts";

function setup(respond: (method: string, path: string, body: unknown) => unknown) {
  const store = createStore();
  store.dispatch({ type: "snapshot", snapshot: snapshot() });
  const notified: UiError[] = [];
  const seen: unknown[] = [];
  const bodies: unknown[] = [];
  const fakeHttp = (async (method: string, path: string, _schema: unknown, body?: unknown) => {
    bodies.push(body);
    const data = await respond(method, path, body);
    if (data instanceof RequestFailed) throw data;
    return { data, serverDate: null };
  }) as unknown as typeof http;
  let id = 0;
  const actions = createActions({
    store,
    http: fakeHttp,
    socket: {
      request: async (command) => {
        seen.push(command);
        if (command.type === "chat.send" && command.text === "fail")
          throw {
            code: "budget_exhausted",
            message: "No budget",
            retryAfterMs: 1000,
          } satisfies UiError;
        return { submissionId: 1 };
      },
    },
    now: () => 5_000,
    newId: () => `id-${++id}-padding`,
    notify: (error) => notified.push(error),
  });
  return { store, actions, notified, seen, bodies };
}

describe("actions", () => {
  it("shows a new task before the server answers, then keeps the server's copy", async () => {
    const { store, actions } = setup(() => task({ id: "t2", title: "Draft" }));
    const pending = actions.addTask({ title: "  Draft " });
    expect(viewTasks(store.getState()).at(-1)).toMatchObject({ title: "Draft", status: "open" });
    expect(await pending).toBeNull();
    expect(viewTasks(store.getState()).map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("shows a new task once when its live update arrives before the HTTP answer", async () => {
    let answer: (value: unknown) => void = () => {};
    const { store, actions, bodies } = setup(() => new Promise((resolve) => (answer = resolve)));
    const pending = actions.addTask({ title: "Draft" });
    const id = (bodies[0] as { id: string }).id;
    expect(id).toMatch(/^task_/);
    const created = task({ id, title: "Draft" });
    store.dispatch({ type: "message", message: { type: "task.upserted", task: created } });
    expect(viewTasks(store.getState()).filter((t) => t.title === "Draft")).toHaveLength(1);
    answer(created);
    expect(await pending).toBeNull();
    expect(viewTasks(store.getState()).map((t) => t.id)).toEqual(["t1", id]);
  });

  it("validates with the protocol schema before sending", async () => {
    const { actions, store } = setup(() => {
      throw new Error("must not be called");
    });
    const error = await actions.addTask({ title: "   " });
    expect(error?.code).toBe("bad_request");
    expect(store.getState().ops).toEqual([]);
  });

  it("rolls a failed completion back and reports it", async () => {
    const { store, actions, notified } = setup(
      () => new RequestFailed({ code: "not_found", message: "No task with id t1." }),
    );
    await actions.completeTask("t1");
    expect(viewTasks(store.getState())[0]?.status).toBe("open");
    expect(store.getState().ops).toEqual([]);
    expect(notified).toEqual([{ code: "not_found", message: "No task with id t1." }]);
  });

  it("rolls back a failed delete", async () => {
    const { store, actions } = setup(
      () => new RequestFailed({ code: "network", message: "offline" }),
    );
    await actions.deleteTask("t1");
    expect(viewTasks(store.getState()).map((t) => t.id)).toEqual(["t1"]);
  });

  it("sends chat over the socket and records a refusal on the message", async () => {
    const { store, actions, seen } = setup(() => null);
    expect(await actions.sendChat("plan my hour")).toBeNull();
    expect(store.getState().chats[0]).toMatchObject({ text: "plan my hour", status: "accepted" });
    expect(seen[0]).toMatchObject({ type: "chat.send", text: "plan my hour" });
    expect((await actions.sendChat("fail"))?.code).toBe("budget_exhausted");
    expect(store.getState().chats[1]).toMatchObject({
      status: "failed",
      error: { code: "budget_exhausted" },
    });
  });

  it("decides approvals over the socket", async () => {
    const { store, actions, seen } = setup(() => null);
    await actions.decide("a1", "approve");
    expect(seen[0]).toMatchObject({
      type: "approval.decide",
      approvalId: "a1",
      decision: "approve",
    });
    expect(store.getState().decisions.a1).toEqual({ decision: "approve", error: null });
  });
});
