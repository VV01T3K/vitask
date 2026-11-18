import { BACKGROUND_CONTEXT, withAbortSignal } from "@earendil-works/chord/context";
import type { Models } from "@earendil-works/pi-ai";
import {
  createRegistry,
  Harness,
  type Conversation,
  type ConversationId,
  type ConversationView,
  type ConversationWatch,
  type LiveState,
  type Report,
  type Storage,
  type TaskId,
  type Wake,
} from "@earendil-works/pi-durable";
import {
  PROTOCOL_VERSION,
  type Approval,
  type ApprovalDecision,
  type CareTimer,
  type CoachLive,
  type CreateTaskBody,
  type CreateTimerBody,
  type ServerEvent,
  type Session,
  type Snapshot,
  type Task,
  type TurnLogEntry,
  type UpdateTaskBody,
  type UpdateTimerBody,
} from "@vitask/protocol";

import { admitChat, budgetStatus } from "./budget.ts";
import { DEFAULT_CONFIG, type CoachConfig } from "./config.ts";
import type { CoachDeps } from "./deps.ts";
import { CoachError } from "./errors.ts";
import { coachExtension } from "./extension.ts";
import { decideApproval } from "./gate.ts";
import * as ops from "./operations.ts";
import type { WorkspaceStore } from "./store.ts";
import { createCoachTasks, type CoachTasks } from "./tasks.ts";
import { toCoachEntry, toCoachLive } from "./transcript.ts";

const ctx = BACKGROUND_CONTEXT;
const SYSTEM_CONVERSATION_KEY = "systemConversationId";

export type CoachRuntimeOptions = {
  /** pi-durable storage: SQLite in a Durable Object, `MemoryStorage` in tests and evals. */
  readonly storage: Storage;
  readonly store: WorkspaceStore;
  readonly models: Models;
  readonly config?: Partial<CoachConfig>;
  readonly publish?: (event: ServerEvent) => void;
  readonly now?: () => number;
  /** A host that wakes itself passes `onWake` and arms in `beforeWork`; see the pi-durable Durable Object example. */
  readonly onWake?: (wake: Wake) => void;
  readonly beforeWork?: () => Promise<void>;
  readonly onReport?: (report: Report) => void;
  readonly newId?: (prefix: string) => string;
};

const defaultId = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;

/**
 * One user's coach over one storage: the pi-durable Harness, the coach conversation, the durable tasks, and the
 * user-facing operations. Runtime-agnostic: a Durable Object hosts it in Workers, a test or an eval in Node.
 */
export class CoachRuntime {
  readonly deps: CoachDeps;
  readonly #harness: Harness;
  readonly #root: Conversation;
  #view: ConversationView | undefined;
  #watch: ConversationWatch | undefined;
  #lastEntryId = 0;
  #lastLive = "";

  private constructor(deps: CoachDeps, harness: Harness, root: Conversation) {
    this.deps = deps;
    this.#harness = harness;
    this.#root = root;
  }

  static async open(options: CoachRuntimeOptions): Promise<CoachRuntime> {
    const config = { ...DEFAULT_CONFIG, ...options.config };
    const handles: {
      harness?: Harness;
      root?: Conversation;
      system?: Conversation;
      tasks?: CoachTasks;
    } = {};
    const need = <T>(value: T | undefined, name: string): T => {
      if (value === undefined) throw new Error(`${name} is not open yet`);
      return value;
    };
    const deps: CoachDeps = {
      store: options.store,
      config,
      models: options.models,
      now: options.now ?? Date.now,
      publish: options.publish ?? (() => {}),
      beforeWork: options.beforeWork ?? (async () => {}),
      harness: () => need(handles.harness, "harness"),
      root: () => need(handles.root, "root conversation"),
      system: () => need(handles.system, "system conversation"),
      tasks: () => need(handles.tasks, "tasks"),
      newId: options.newId ?? defaultId,
    };
    const tasks = createCoachTasks(deps);
    handles.tasks = tasks;
    const registry = createRegistry();
    registry.install(coachExtension(deps, Object.values(tasks)));

    const harness = await Harness.open(
      options.storage,
      {
        models: options.models,
        registry,
        identity: { attribution: null },
        now: deps.now,
        onWake: options.onWake,
        onReport: options.onReport,
        settings: {
          retry: { maxRetries: 2 },
          stream: { timeoutMs: 60_000 },
          // A follow-up typed while a run failed should still be answered.
          afterFailedRun: "continue",
        },
      },
      ctx,
    );
    handles.harness = harness;

    const agent = {
      model: { provider: config.provider, modelId: config.model },
      thinkingLevel: config.thinkingLevel,
      maxTurns: config.maxTurns,
    };
    const root = await harness.root(ctx, { agent });
    const current = await root.agent(ctx);
    if (
      current.model?.provider !== agent.model.provider ||
      current.model.modelId !== agent.model.modelId ||
      current.maxTurns !== agent.maxTurns ||
      current.thinkingLevel !== agent.thinkingLevel
    ) {
      await root.configure(agent, ctx);
    }
    handles.root = root;
    handles.system = await openSystemConversation(harness, options.store);

    const runtime = new CoachRuntime(deps, harness, root);
    await ops.seedWorkspace(deps);
    await runtime.#startWatch();
    await ops.reconcile(deps);
    return runtime;
  }

  get harness(): Harness {
    return this.#harness;
  }

  wake(): Wake {
    return this.#harness.wake();
  }

  /** Starts task scheduling: due sleeps and work a previous process left. */
  resume(): void {
    this.#harness.resume();
  }

  async close(): Promise<void> {
    await this.#watch?.stop();
    await this.#harness.close(ctx);
  }

  // -------------------------------------------------------------------------------------------------------------
  // Coach transcript to clients

  async #startWatch(): Promise<void> {
    const watch = await this.#root.watch(ctx);
    this.#watch = watch;
    this.#view = watch.value;
    this.#lastEntryId = Math.max(0, ...watch.value.entries.map((entry) => Number(entry.id)));
    this.#lastLive = JSON.stringify(this.#live());
    watch.start(async (call) => {
      if (call.kind !== "value") return;
      this.#view = call.value;
      for (const entry of call.value.entries) {
        if (Number(entry.id) <= this.#lastEntryId) continue;
        this.#lastEntryId = Number(entry.id);
        const coachEntry = toCoachEntry(entry);
        if (coachEntry) this.deps.publish({ type: "coach.entry", entry: coachEntry });
      }
      const live = this.#live();
      const serialized = JSON.stringify(live);
      if (serialized !== this.#lastLive) {
        this.#lastLive = serialized;
        this.deps.publish({ type: "coach.live", live });
      }
    });
  }

  #live(): CoachLive {
    return toCoachLive(this.#view?.docs["pi.live"] as LiveState | undefined);
  }

  // -------------------------------------------------------------------------------------------------------------
  // Reads

  async snapshot(): Promise<Snapshot> {
    const { store, config } = this.deps;
    const session = (await store.getActiveSession()) ?? (await store.getLatestSession()) ?? null;
    const pending = await store.listApprovals({ status: "pending", limit: 50 });
    const recent = await store.listApprovals({ limit: 20 });
    const approvals = [...new Map([...recent, ...pending].map((a) => [a.id, a])).values()].sort(
      (a, b) => a.createdAt - b.createdAt,
    );
    return {
      protocol: PROTOCOL_VERSION,
      tasks: await store.listTasks(),
      timers: await store.listTimers(),
      session,
      nudges: session ? await store.listNudges(session.id) : [],
      hypes: await store.listHypes(20),
      approvals,
      memory: await store.listMemory(),
      plan: (await store.getPlan()) ?? null,
      coach: {
        model: `${config.provider}/${config.model}`,
        entries: (this.#view?.entries ?? []).flatMap((entry) => toCoachEntry(entry) ?? []),
        live: this.#live(),
      },
      budget: await budgetStatus(store, config, this.deps.now()),
    };
  }

  turns(limit: number): Promise<TurnLogEntry[]> {
    return this.deps.store.listTurns(limit);
  }

  // -------------------------------------------------------------------------------------------------------------
  // The user's own actions; none of them goes through the coach or the approval gate.

  createTask({ id, ...input }: CreateTaskBody): Promise<Task> {
    return ops.createTask(this.deps, input, id);
  }

  updateTask(id: string, body: UpdateTaskBody): Promise<Task> {
    return ops.updateTask(this.deps, id, body, { hype: true });
  }

  completeTask(id: string): Promise<Task> {
    return ops.updateTask(this.deps, id, { status: "done" }, { hype: true });
  }

  async deleteTask(id: string): Promise<void> {
    await ops.deleteTask(this.deps, id);
  }

  createTimer(body: CreateTimerBody): Promise<CareTimer> {
    return ops.createTimer(this.deps, body);
  }

  updateTimer(id: string, body: UpdateTimerBody): Promise<CareTimer> {
    return ops.updateTimer(this.deps, id, body);
  }

  deleteTimer(id: string): Promise<void> {
    return ops.deleteTimer(this.deps, id);
  }

  startSession(): Promise<Session> {
    return ops.startSession(this.deps);
  }

  /** Ends the session and waits up to `waitMs` for the debrief; the session is returned either way. */
  async endSession(waitMs = 25_000): Promise<Session> {
    const session = await ops.endSession(this.deps, "user");
    const taskId = (await this.deps.store.getSessionTasks(session.id)).wrapUpTaskId;
    if (taskId !== null && waitMs > 0) {
      const signal = AbortSignal.timeout(waitMs);
      // A timeout cancels only this wait, never the wrap-up.
      await this.#harness
        .waitForTask(taskId as TaskId, withAbortSignal(signal, ctx))
        .catch(() => undefined);
    }
    return (await this.deps.store.getSession(session.id)) ?? session;
  }

  // -------------------------------------------------------------------------------------------------------------
  // Coach

  /** Admits a chat message; the answer streams to clients. A retried `requestId` returns the same submission. */
  async chat(text: string, requestId: string): Promise<{ submissionId: number }> {
    await admitChat(this.deps.store, this.deps.config, this.deps.now());
    await this.deps.beforeWork();
    const submission = await this.#root.submit({ type: "input", content: text, requestId }, ctx);
    return { submissionId: Number(submission.id) };
  }

  decideApproval(id: string, decision: ApprovalDecision): Promise<Approval> {
    return decideApproval(this.deps, id, decision);
  }

  /** Resolves once the coach conversation has no running work; for tests and evals. */
  async waitForCoachIdle(): Promise<void> {
    await this.#root.waitForIdle(ctx);
  }
}

async function openSystemConversation(
  harness: Harness,
  store: WorkspaceStore,
): Promise<Conversation> {
  const stored = await store.getMeta(SYSTEM_CONVERSATION_KEY);
  if (stored !== undefined) {
    const existing = await harness.conversation(Number(stored) as ConversationId, ctx);
    if (existing) return existing;
  }
  const created = await harness.createConversation({ ownership: { kind: "ownerless" } }, ctx);
  await store.setMeta(SYSTEM_CONVERSATION_KEY, String(created.id));
  return created;
}

export { CoachError };
