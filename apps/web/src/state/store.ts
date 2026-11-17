import type { ServerMessage } from "@vitask/protocol";

import { initialState, reduce } from "./reducer.ts";
import type { Action, State } from "./types.ts";

export type Store = {
  getState: () => State;
  dispatch: (action: Action) => void;
  subscribe: (listener: () => void) => () => void;
  /** Server messages after they were applied, for side effects such as toasts and sounds. */
  onMessage: (listener: (message: ServerMessage) => void) => () => void;
};

export function createStore(state: State = initialState): Store {
  const listeners = new Set<() => void>();
  const messageListeners = new Set<(message: ServerMessage) => void>();
  return {
    getState: () => state,
    dispatch(action) {
      const next = reduce(state, action);
      if (next !== state) {
        state = next;
        for (const listener of listeners) listener();
      }
      if (action.type === "message")
        for (const listener of messageListeners) listener(action.message);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onMessage(listener) {
      messageListeners.add(listener);
      return () => messageListeners.delete(listener);
    },
  };
}
