import { PROTOCOL_VERSION, WS_PATH } from "@vitask/protocol";
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { toast } from "sonner";

import { describeError } from "../lib/errors.ts";
import { createActions, type Actions } from "./actions.ts";
import { http } from "./api.ts";
import { LiveSocket } from "./socket.ts";
import { createStore, type Store } from "./store.ts";
import type { State } from "./types.ts";

export type Client = { store: Store; actions: Actions; socket: LiveSocket };

/** The app's single connection to its workspace: store, WebSocket and actions. */
export function createClient(): Client {
  const store = createStore();
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new LiveSocket(
    `${protocol}//${location.host}${WS_PATH}?protocol=${PROTOCOL_VERSION}`,
    store.dispatch,
    {
      createSocket: (url) => new WebSocket(url),
      now: Date.now,
      random: Math.random,
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (handle) => window.clearTimeout(handle as number | undefined),
      isOnline: () => navigator.onLine,
    },
  );
  const actions = createActions({
    store,
    http,
    socket,
    now: Date.now,
    newId: () => crypto.randomUUID(),
    notify: (error) => toast.error(describeError(error)),
  });
  return { store, actions, socket };
}

/** Starts the connection; returns a stop function. Call after `bootstrap` set the cookie. */
export function connect({ socket }: Client): () => void {
  const retry = () => socket.retryNow();
  const onVisible = () => {
    if (document.visibilityState === "visible") retry();
  };
  window.addEventListener("online", retry);
  document.addEventListener("visibilitychange", onVisible);
  socket.start();
  return () => {
    window.removeEventListener("online", retry);
    document.removeEventListener("visibilitychange", onVisible);
    socket.stop();
  };
}

const ClientContext = createContext<Client | null>(null);

export function ClientProvider({ client, children }: { client: Client; children: ReactNode }) {
  return <ClientContext value={client}>{children}</ClientContext>;
}

export function useClient(): Client {
  const client = useContext(ClientContext);
  if (!client) throw new Error("useClient needs a ClientProvider");
  return client;
}

export function useActions(): Actions {
  return useClient().actions;
}

/** Subscribes to a slice of the state; `select` must return a stable value for unchanged state. */
export function useAppState<T>(select: (state: State) => T): T {
  const { store } = useClient();
  return useSyncExternalStore(store.subscribe, () => select(store.getState()));
}
