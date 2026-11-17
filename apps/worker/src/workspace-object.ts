import type { Wake } from "@earendil-works/pi-durable";
import { SqliteStorage } from "@earendil-works/pi-durable/storage/sqlite";
import { DurableObjectSqliteDatabase } from "@earendil-works/pi-durable/storage/sqlite/cloudflare";
import { CoachRuntime } from "@vitask/coach";
import { ApiError, ClientMessage, PROTOCOL_VERSION, type ServerMessage } from "@vitask/protocol";
import { DurableObject } from "cloudflare:workers";

import { configFromEnv, modelsFromEnv, type Env } from "./env.ts";
import { apiError, errorBody, errorResponse, json } from "./http.ts";
import { migrate } from "./migrations.ts";
import { routeApi } from "./router.ts";
import { SqliteWorkspaceStore } from "./sqlite-store.ts";

/** How soon a crashed or evicted object is woken again while work is running. */
const HEARTBEAT_MS = 60_000;
const KEEP_OPEN_MS = 30_000;
const INTERNAL_COMMAND_PATH = "/internal/command";

/**
 * One user's workspace: tasks, timers, sessions and the coach's durable state in one SQLite database. The Harness
 * lifecycle follows the pi-durable README's Durable Object example: open inside `blockConcurrencyWhile` (no model
 * calls there), `onWake` keeps the alarm armed, `alarm()` resumes.
 */
export class WorkspaceObject extends DurableObject<Env> {
  #runtime: CoachRuntime | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      // A fallback before anything can throw: an object whose open or recovery fails is started again.
      const fallback = Date.now() + HEARTBEAT_MS;
      const current = await ctx.storage.getAlarm();
      if (current === null || current > fallback) await ctx.storage.setAlarm(fallback);

      const database = new DurableObjectSqliteDatabase(ctx.storage);
      await migrate(database);
      const config = configFromEnv(env);
      const runtime = await CoachRuntime.open({
        storage: await SqliteStorage.open(database, { prefix: "pi_" }),
        store: new SqliteWorkspaceStore(database),
        models: await modelsFromEnv(env, config),
        config,
        publish: (event) => this.#broadcast(event),
        // A failed alarm write resets the object; it arms again when it next starts.
        onWake: (wake) => void this.#arm(wake).catch(() => ctx.abort("Alarm write failed")),
        beforeWork: () => this.#armHeartbeat(),
        onReport: (report) => console.warn("pi-durable report", report.kind, String(report.error)),
      });
      this.#runtime = runtime;
      // A storage failure closes the Harness for good; reset the object so the next event reopens it.
      void runtime.harness.closed.then((end) => {
        if (end.kind === "failed") ctx.abort("Harness failed");
      });
      await this.#arm(runtime.wake());
      runtime.resume();
    });
  }

  get #coach(): CoachRuntime {
    if (!this.#runtime) throw new Error("Workspace is not open");
    return this.#runtime;
  }

  /** A recovery heartbeat while work runs, never later than the earliest sleep. */
  async #arm(wake: Wake): Promise<void> {
    const heartbeat = wake.active ? Date.now() + HEARTBEAT_MS : undefined;
    const at =
      heartbeat === undefined || wake.at === undefined
        ? (heartbeat ?? wake.at)
        : Math.min(heartbeat, wake.at);
    if (at === undefined) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(at);
  }

  /**
   * Keeps the current event open while the Harness has runnable work, for at most `KEEP_OPEN_MS`. celld lets a Durable
   * Object's background work outlive its event only while I/O stays pending; pi-durable's scheduler has gaps
   * between steps, and the next storage call then waited for the next event (the 60 s heartbeat), stalling a woken
   * tool call or a due sleep. Cloudflare keeps the object running anyway, so this costs nothing there.
   */
  #keepOpen(): void {
    const deadline = Date.now() + KEEP_OPEN_MS;
    this.ctx.waitUntil(
      (async () => {
        let quietChecks = 0;
        while (Date.now() < deadline && quietChecks < 2) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          quietChecks = this.#runtime?.wake().active ? 0 : quietChecks + 1;
        }
      })(),
    );
  }

  /** Armed before calls that can start work; `onWake` follows once the commit lands. Early alarms are harmless. */
  async #armHeartbeat(): Promise<void> {
    const heartbeat = Date.now() + HEARTBEAT_MS;
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > heartbeat) await this.ctx.storage.setAlarm(heartbeat);
  }

  override async alarm(): Promise<void> {
    this.#keepOpen();
    await this.#arm({ ...this.#coach.wake(), active: true });
    this.#coach.resume();
  }

  override async fetch(request: Request): Promise<Response> {
    this.#keepOpen();
    if (new URL(request.url).pathname === INTERNAL_COMMAND_PATH) return this.#runCommand(request);
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket")
      return this.#acceptSocket(request);
    const response = await routeApi(this.#coach, request);
    // Arm inside the event as well as from onWake: an alarm set before the response boundary is durable when the
    // response is sent, while one set later from a microtask was lost by a celld crash in testing.
    await this.#arm(this.#coach.wake());
    return response;
  }

  // -------------------------------------------------------------------------------------------------------------
  // WebSockets (hibernatable): a snapshot on connect, then one event per change.

  async #acceptSocket(request: Request): Promise<Response> {
    const protocol = new URL(request.url).searchParams.get("protocol");
    if (protocol !== String(PROTOCOL_VERSION)) {
      return apiError(
        "bad_request",
        `Unsupported protocol; this server speaks ${PROTOCOL_VERSION}`,
      );
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    this.#send(server, {
      type: "hello",
      protocol: PROTOCOL_VERSION,
      snapshot: await this.#coach.snapshot(),
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  #send(socket: WebSocket, message: ServerMessage): void {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      // The socket closed between the list and the send; its close handler cleans up.
    }
  }

  #broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(payload);
      } catch {
        // As in #send.
      }
    }
  }

  override async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      parsed = undefined;
    }
    const result = ClientMessage.safeParse(parsed);
    if (!result.success) {
      this.#send(socket, {
        type: "error",
        requestId: null,
        error: errorBody(result.error).body.error,
      });
      return;
    }
    const message = result.data;
    switch (message.type) {
      case "ping":
        return this.#send(socket, { type: "pong" });
      case "resync":
        return this.#send(socket, {
          type: "hello",
          protocol: PROTOCOL_VERSION,
          snapshot: await this.#coach.snapshot(),
        });
      case "chat.send":
      case "approval.decide": {
        const response = await this.#dispatchCommand(message);
        const body: unknown = await response.json();
        if (response.ok) {
          this.#send(socket, { type: "ack", requestId: message.requestId, result: body });
        } else {
          const { error } = ApiError.parse(body);
          this.#send(socket, { type: "error", requestId: message.requestId, error });
        }
      }
    }
  }

  /**
   * Runs a socket command as a fetch event of this same object. celld ends a `webSocketMessage` event's I/O when the
   * handler returns, so durable work the command starts (the woken tool call, the next model turn) would fail with
   * "the cell event ended before it could acquire an input gate" and take the Harness down. A fetch event keeps its
   * pending I/O alive on both celld and Cloudflare. The path is not reachable from outside: the Worker forwards only
   * `/api/*`.
   */
  #dispatchCommand(message: ClientMessage): Promise<Response> {
    const self = this.env.WORKSPACE.get(this.ctx.id);
    return self.fetch(
      new Request(`https://workspace.internal${INTERNAL_COMMAND_PATH}`, {
        method: "POST",
        body: JSON.stringify(message),
      }),
    );
  }

  async #runCommand(request: Request): Promise<Response> {
    try {
      const message = ClientMessage.parse(await request.json());
      if (message.type === "chat.send")
        return json(await this.#coach.chat(message.text, message.requestId));
      if (message.type === "approval.decide") {
        return json(await this.#coach.decideApproval(message.approvalId, message.decision));
      }
      return apiError("bad_request", "Not a command");
    } catch (error) {
      return errorResponse(error);
    }
  }

  override async webSocketClose(socket: WebSocket, code: number, reason: string): Promise<void> {
    // 1005 and 1006 describe a close without a frame; they cannot be sent back.
    if (code !== 1005 && code !== 1006) socket.close(code, reason);
  }
}
