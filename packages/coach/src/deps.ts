import type { Models } from "@earendil-works/pi-ai";
import type { Conversation, Harness } from "@earendil-works/pi-durable";
import type { ServerEvent } from "@vitask/protocol";

import type { CoachConfig } from "./config.ts";
import type { WorkspaceStore } from "./store.ts";
import type { CoachTasks } from "./tasks.ts";

/**
 * What the coach's tools, tasks and operations share. The Harness and the conversations exist only after open, so
 * they are getters; nothing calls them before `CoachRuntime.open()` resolves.
 */
export type CoachDeps = {
  readonly store: WorkspaceStore;
  readonly config: CoachConfig;
  readonly models: Models;
  readonly now: () => number;
  /** Pushes a change to every connected client. Must not throw or block. */
  readonly publish: (event: ServerEvent) => void;
  /**
   * Runs before any call that can start durable work, so a host that wakes itself (a Durable Object alarm) is armed
   * first; see the pi-durable README's Durable Object example.
   */
  readonly beforeWork: () => Promise<void>;
  readonly harness: () => Harness;
  /** The coach conversation the user chats with. */
  readonly root: () => Conversation;
  /** An ownerless conversation that owns the coach's background tasks; it never runs a model. */
  readonly system: () => Conversation;
  readonly newId: (prefix: string) => string;
  /** The durable task definitions bound to these deps. */
  readonly tasks: () => CoachTasks;
};
