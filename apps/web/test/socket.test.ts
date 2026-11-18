import { beforeEach, describe, expect, it } from "vite-plus/test";

import { backoffMs, LiveSocket, NOT_CONNECTED } from "../src/state/socket.ts";
import type { Action } from "../src/state/types.ts";
import { snapshot } from "./fixtures.ts";

class FakeSocket {
  readyState = 0;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

/** Manual clock: timers run only when the test advances time. */
class Clock {
  now = 0;
  timers = new Map<number, { at: number; fn: () => void }>();
  next = 1;
  setTimeout = (fn: () => void, ms: number) => {
    const id = this.next++;
    this.timers.set(id, { at: this.now + ms, fn });
    return id;
  };
  clearTimeout = (id: unknown) => void this.timers.delete(id as number);
  advance(ms: number) {
    const until = this.now + ms;
    for (;;) {
      const due = [...this.timers.entries()]
        .filter(([, t]) => t.at <= until)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.timers.delete(due[0]);
      this.now = due[1].at;
      due[1].fn();
    }
    this.now = until;
  }
}

let sockets: FakeSocket[];
let actions: Action[];
let clock: Clock;
let online: boolean;
let live: LiveSocket;

beforeEach(() => {
  sockets = [];
  actions = [];
  clock = new Clock();
  online = true;
  live = new LiveSocket("ws://test/api/ws?protocol=1", (action) => actions.push(action), {
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
    now: () => clock.now,
    random: () => 1,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    isOnline: () => online,
  });
});

const statuses = () =>
  actions.flatMap((a) => (a.type === "connection" ? [a.connection.status] : []));
const hello = { type: "hello", protocol: 1, snapshot: snapshot() };

describe("LiveSocket", () => {
  it("backs off exponentially with jitter, capped at 30 s", () => {
    expect(backoffMs(1, 1)).toBe(500);
    expect(backoffMs(3, 1)).toBe(2_000);
    expect(backoffMs(3, 0)).toBe(1_000);
    expect(backoffMs(20, 1)).toBe(30_000);
  });

  it("connects, forwards validated messages and drops invalid ones with a resync", () => {
    live.start();
    sockets[0]!.open();
    sockets[0]!.receive(hello);
    sockets[0]!.receive({ type: "task.upserted", task: { id: "broken" } });
    expect(statuses()).toEqual(["connecting", "open"]);
    expect(actions.filter((a) => a.type === "message")).toHaveLength(1);
    expect(sockets[0]!.sent).toEqual([{ type: "resync" }]);
  });

  it("reconnects with backoff and asks for a resync after a reconnect", () => {
    live.start();
    sockets[0]!.open();
    expect(sockets[0]!.sent).toEqual([]); // the first hello needs no resync
    sockets[0]!.close();
    expect(actions.at(-1)).toEqual({
      type: "connection",
      connection: { status: "reconnecting", attempt: 1, retryAt: 500 },
    });
    clock.advance(499);
    expect(sockets).toHaveLength(1);
    clock.advance(1);
    expect(sockets).toHaveLength(2);
    sockets[1]!.close(); // failed attempt: longer wait
    expect(actions.at(-1)).toMatchObject({ connection: { attempt: 2, retryAt: 1_500 } });
    clock.advance(1_000);
    sockets[2]!.open();
    expect(sockets[2]!.sent).toEqual([{ type: "resync" }]);
    expect(statuses().at(-1)).toBe("open");
  });

  it("waits for the network when offline and retries at once when it is back", () => {
    live.start();
    sockets[0]!.open();
    online = false;
    sockets[0]!.close();
    expect(statuses().at(-1)).toBe("offline");
    clock.advance(60_000);
    expect(sockets).toHaveLength(1);
    online = true;
    live.retryNow();
    expect(sockets).toHaveLength(2);
  });

  it("closes a silent connection after an unanswered ping", () => {
    live.start();
    sockets[0]!.open();
    clock.advance(25_000);
    expect(sockets[0]!.sent).toEqual([{ type: "ping" }]);
    clock.advance(10_000);
    expect(sockets[0]!.readyState).toBe(3);
    expect(statuses().at(-1)).toBe("reconnecting");
  });

  it("resolves a command on ack and rejects it on error or on a dropped connection", async () => {
    await expect(
      live.request({ type: "chat.send", requestId: "r0000001", text: "x" }),
    ).rejects.toBe(NOT_CONNECTED);
    live.start();
    sockets[0]!.open();
    const ok = live.request({ type: "chat.send", requestId: "r0000001", text: "hi" });
    sockets[0]!.receive({ type: "ack", requestId: "r0000001", result: { submissionId: 3 } });
    await expect(ok).resolves.toEqual({ submissionId: 3 });

    const refused = live.request({ type: "chat.send", requestId: "r0000002", text: "hi" });
    sockets[0]!.receive({
      type: "error",
      requestId: "r0000002",
      error: { code: "rate_limited", message: "slow", retryAfterMs: 1000 },
    });
    await expect(refused).rejects.toMatchObject({ code: "rate_limited", retryAfterMs: 1000 });

    const dropped = live.request({
      type: "approval.decide",
      requestId: "r0000003",
      approvalId: "a1",
      decision: "approve",
    });
    sockets[0]!.close();
    await expect(dropped).rejects.toMatchObject({ code: "network" });
    expect(actions.some((a) => a.type === "message" && a.message.type === "ack")).toBe(false);
  });

  it("stop closes for good", () => {
    live.start();
    sockets[0]!.open();
    live.stop();
    clock.advance(60_000);
    expect(sockets).toHaveLength(1);
  });
});
