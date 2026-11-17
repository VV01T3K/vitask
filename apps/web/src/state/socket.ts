import { ServerMessage, type ClientMessage } from "@vitask/protocol";

import type { Action, UiError } from "./types.ts";

/** The parts of the browser the socket needs; tests pass fakes. */
export type SocketEnv = {
  createSocket: (url: string) => WebSocket;
  now: () => number;
  random: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  isOnline: () => boolean;
};

type Command = Extract<ClientMessage, { requestId: string }>;
type Waiter = {
  resolve: (result: unknown) => void;
  reject: (error: UiError) => void;
  timer: unknown;
};

const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 30_000;
const PING_EVERY_MS = 25_000;
const PONG_WITHIN_MS = 10_000;
const REQUEST_TIMEOUT_MS = 20_000;

export const NOT_CONNECTED: UiError = {
  code: "network",
  message: "Not connected to the server. It will reconnect by itself.",
};

/** Delay before reconnect attempt `attempt` (1-based): exponential, capped, with jitter in [50%, 100%]. */
export function backoffMs(attempt: number, random: number): number {
  const ceiling = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (attempt - 1));
  return Math.round(ceiling * (0.5 + random / 2));
}

/**
 * One WebSocket to the workspace, kept open: reconnects with backoff, asks for a fresh snapshot after a reconnect
 * (events are not replayed), validates every message against the protocol and turns command answers into promises.
 */
export class LiveSocket {
  #socket: WebSocket | null = null;
  #attempt = 0;
  #everOpened = false;
  #stopped = false;
  #retryTimer: unknown = null;
  #pingTimer: unknown = null;
  #pongTimer: unknown = null;
  #waiters = new Map<string, Waiter>();

  constructor(
    private readonly url: string,
    private readonly dispatch: (action: Action) => void,
    private readonly env: SocketEnv,
  ) {}

  start(): void {
    this.#stopped = false;
    this.#connect();
  }

  stop(): void {
    this.#stopped = true;
    this.#clearTimers();
    this.#socket?.close(1000);
    this.#socket = null;
    this.#failWaiters();
  }

  /** The browser came back online, or the tab became visible: retry now instead of waiting out the backoff. */
  retryNow(): void {
    if (this.#stopped || this.#socket) return;
    this.env.clearTimeout(this.#retryTimer);
    this.#connect();
  }

  get isOpen(): boolean {
    return this.#socket?.readyState === 1;
  }

  /** Sends a command and resolves with the server's `ack` result, or rejects with its `error`. */
  request(command: Command): Promise<unknown> {
    if (!this.#socket || !this.isOpen) return Promise.reject(NOT_CONNECTED);
    return new Promise((resolve, reject) => {
      const timer = this.env.setTimeout(() => {
        this.#waiters.delete(command.requestId);
        reject({
          code: "network",
          message: "The server did not answer in time.",
        } satisfies UiError);
      }, REQUEST_TIMEOUT_MS);
      this.#waiters.set(command.requestId, { resolve, reject, timer });
      this.#socket!.send(JSON.stringify(command));
    });
  }

  #connect(): void {
    this.#retryTimer = null;
    if (!this.env.isOnline()) {
      this.dispatch({ type: "connection", connection: { status: "offline" } });
      return; // `retryNow` runs on the browser's `online` event
    }
    if (!this.#everOpened)
      this.dispatch({ type: "connection", connection: { status: "connecting" } });
    const socket = this.env.createSocket(this.url);
    this.#socket = socket;
    socket.onopen = () => {
      if (this.#socket !== socket) return;
      const reconnect = this.#everOpened;
      this.#everOpened = true;
      this.#attempt = 0;
      this.dispatch({ type: "connection", connection: { status: "open" } });
      // The server greets every connection with a snapshot; after a gap, ask again in case it raced ahead.
      if (reconnect) this.#send({ type: "resync" });
      this.#schedulePing();
    };
    socket.onmessage = (event) => {
      if (this.#socket !== socket) return;
      this.#onMessage(String(event.data));
    };
    socket.onclose = () => {
      if (this.#socket !== socket) return;
      this.#socket = null;
      this.#clearTimers();
      this.#failWaiters();
      if (!this.#stopped) this.#scheduleReconnect();
    };
    socket.onerror = () => {}; // a close event follows
  }

  #onMessage(raw: string): void {
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      data = undefined;
    }
    const parsed = ServerMessage.safeParse(data);
    if (!parsed.success) {
      // Our copy may now differ from the server's: start over from a snapshot.
      console.warn("vitask: dropped an invalid server message", parsed.error.issues);
      this.#send({ type: "resync" });
      return;
    }
    const message = parsed.data;
    this.#schedulePing(); // any message proves the line is alive
    if (message.type === "ack" || (message.type === "error" && message.requestId !== null)) {
      const waiter = this.#waiters.get(message.requestId!);
      if (waiter) {
        this.#waiters.delete(message.requestId!);
        this.env.clearTimeout(waiter.timer);
        if (message.type === "ack") waiter.resolve(message.result);
        else waiter.reject(message.error);
      }
      return;
    }
    this.dispatch({ type: "message", message });
  }

  #send(message: ClientMessage): void {
    if (this.isOpen) this.#socket!.send(JSON.stringify(message));
  }

  #schedulePing(): void {
    this.env.clearTimeout(this.#pingTimer);
    this.env.clearTimeout(this.#pongTimer);
    this.#pingTimer = this.env.setTimeout(() => {
      this.#send({ type: "ping" });
      // No answer: the connection is dead even if the browser has not noticed.
      this.#pongTimer = this.env.setTimeout(() => this.#socket?.close(4000), PONG_WITHIN_MS);
    }, PING_EVERY_MS);
  }

  #scheduleReconnect(): void {
    this.#attempt += 1;
    if (!this.env.isOnline()) {
      this.dispatch({ type: "connection", connection: { status: "offline" } });
      return;
    }
    const delay = backoffMs(this.#attempt, this.env.random());
    this.dispatch({
      type: "connection",
      connection: {
        status: "reconnecting",
        attempt: this.#attempt,
        retryAt: this.env.now() + delay,
      },
    });
    this.#retryTimer = this.env.setTimeout(() => this.#connect(), delay);
  }

  #clearTimers(): void {
    this.env.clearTimeout(this.#retryTimer);
    this.env.clearTimeout(this.#pingTimer);
    this.env.clearTimeout(this.#pongTimer);
    this.#retryTimer = this.#pingTimer = this.#pongTimer = null;
  }

  #failWaiters(): void {
    for (const waiter of this.#waiters.values()) {
      this.env.clearTimeout(waiter.timer);
      waiter.reject({
        code: "network",
        message: "The connection dropped before the server answered.",
      });
    }
    this.#waiters.clear();
  }
}
