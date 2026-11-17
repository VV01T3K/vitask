import type { ServerEvent, Snapshot } from "@vitask/protocol";

import type { Action, OpResult, PendingChat, State } from "./types.ts";

export const initialState: State = {
  connection: { status: "connecting" },
  server: null,
  clockOffsetMs: 0,
  ops: [],
  chats: [],
  decisions: {},
  turns: [],
  turnsLoaded: false,
  firing: {},
};

const TURNS_KEPT = 200;
const HYPES_KEPT = 20;

type WithId = { id: string };
type Versioned = WithId & { updatedAt: number };

function upsert<T extends WithId>(list: T[], item: T): T[] {
  const index = list.findIndex((existing) => existing.id === item.id);
  if (index === -1) return [...list, item];
  return list.map((existing, i) => (i === index ? item : existing));
}

/** Upsert that ignores an older copy (an event can arrive after the HTTP answer of a later change). */
function upsertVersioned<T extends Versioned>(list: T[], item: T): T[] {
  const existing = list.find((entry) => entry.id === item.id);
  if (existing && existing.updatedAt > item.updatedAt) return list;
  return upsert(list, item);
}

function remove<T extends WithId>(list: T[], id: string): T[] {
  return list.some((item) => item.id === id) ? list.filter((item) => item.id !== id) : list;
}

function lastEntryId(snapshot: Snapshot | null): number {
  const entries = snapshot?.coach.entries ?? [];
  return entries.length === 0 ? 0 : entries[entries.length - 1]!.id;
}

/** Pending chats whose user message is in the transcript are done. */
function reconcileChats(chats: PendingChat[], snapshot: Snapshot): PendingChat[] {
  if (chats.length === 0) return chats;
  const userEntries = snapshot.coach.entries.filter((entry) => entry.role === "user");
  const used = new Set<number>();
  return chats.filter((chat) => {
    if (chat.status === "failed") return true;
    const match = userEntries.find(
      (entry) =>
        !used.has(entry.id) && entry.id > chat.afterEntryId && entry.text === chat.text.trim(),
    );
    if (!match) return true;
    used.add(match.id);
    return false;
  });
}

function applyEvent(server: Snapshot, event: ServerEvent): Snapshot {
  switch (event.type) {
    case "task.upserted":
      return { ...server, tasks: upsertVersioned(server.tasks, event.task) };
    case "task.deleted":
      // Steps go with their task.
      return {
        ...server,
        tasks: server.tasks.filter((task) => task.id !== event.id && task.parentId !== event.id),
      };
    case "timer.upserted":
      return { ...server, timers: upsertVersioned(server.timers, event.timer) };
    case "timer.deleted":
      return { ...server, timers: remove(server.timers, event.id) };
    case "session.updated": {
      const sameSession = server.session?.id === event.session.id;
      return { ...server, session: event.session, nudges: sameSession ? server.nudges : [] };
    }
    case "nudge":
      return { ...server, nudges: upsert(server.nudges, event.nudge) };
    case "hype": {
      const others = server.hypes.filter((hype) => hype.taskId !== event.hype.taskId);
      return { ...server, hypes: [event.hype, ...others].slice(0, HYPES_KEPT) };
    }
    case "approval.upserted":
      return { ...server, approvals: upsert(server.approvals, event.approval) };
    case "memory.updated":
      return { ...server, memory: event.memory };
    case "plan.updated":
      return { ...server, plan: event.plan };
    case "coach.entry":
      if (event.entry.id <= lastEntryId(server)) return server;
      return {
        ...server,
        coach: { ...server.coach, entries: [...server.coach.entries, event.entry] },
      };
    case "coach.live":
      return { ...server, coach: { ...server.coach, live: event.live } };
    case "budget.updated":
      return { ...server, budget: event.budget };
    case "turn.logged":
      return server; // kept outside the snapshot, see `reduce`
  }
}

function commit(server: Snapshot, result: OpResult): Snapshot {
  if ("task" in result) return applyEvent(server, { type: "task.upserted", task: result.task });
  if ("timer" in result) return applyEvent(server, { type: "timer.upserted", timer: result.timer });
  if ("deletedTaskId" in result)
    return applyEvent(server, { type: "task.deleted", id: result.deletedTaskId });
  return applyEvent(server, { type: "timer.deleted", id: result.deletedTimerId });
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const { [key]: _removed, ...rest } = record;
  return rest;
}

function onSnapshot(state: State, snapshot: Snapshot): State {
  const timerIds = new Set(snapshot.timers.map((timer) => timer.id));
  const sessionActive = snapshot.session?.status === "active";
  const firing = Object.fromEntries(
    Object.entries(state.firing).filter(([timerId]) => sessionActive && timerIds.has(timerId)),
  );
  // A decision the server has already settled needs no spinner.
  const decisions = Object.fromEntries(
    Object.entries(state.decisions).filter(
      ([id, pending]) =>
        pending.error !== null ||
        snapshot.approvals.some((approval) => approval.id === id && approval.status === "pending"),
    ),
  );
  return {
    ...state,
    server: snapshot,
    firing,
    decisions,
    chats: reconcileChats(state.chats, snapshot),
  };
}

function onEvent(state: State, event: ServerEvent): State {
  if (event.type === "turn.logged") {
    if (state.turns.some((turn) => turn.id === event.turn.id)) return state;
    return { ...state, turns: [event.turn, ...state.turns].slice(0, TURNS_KEPT) };
  }
  if (!state.server) return state; // the coming hello covers it
  const server = applyEvent(state.server, event);
  let next: State = { ...state, server };
  switch (event.type) {
    case "coach.entry":
      if (event.entry.role === "user")
        next = { ...next, chats: reconcileChats(next.chats, server) };
      break;
    case "nudge":
      next = { ...next, firing: { ...next.firing, [event.nudge.timerId]: event.nudge } };
      break;
    case "timer.deleted":
      next = { ...next, firing: withoutKey(next.firing, event.id) };
      break;
    case "session.updated":
      if (event.session.status !== "active") next = { ...next, firing: {} };
      break;
    case "approval.upserted":
      if (event.approval.status !== "pending")
        next = { ...next, decisions: withoutKey(next.decisions, event.approval.id) };
      break;
  }
  return next;
}

export function reduce(state: State, action: Action): State {
  switch (action.type) {
    case "connection":
      return { ...state, connection: action.connection };
    case "snapshot":
      return {
        ...onSnapshot(state, action.snapshot),
        clockOffsetMs: action.clockOffsetMs ?? state.clockOffsetMs,
      };
    case "message": {
      const { message } = action;
      if (message.type === "hello") return onSnapshot(state, message.snapshot);
      if (message.type === "ack" || message.type === "error" || message.type === "pong")
        return state; // answers belong to the socket's requests
      return onEvent(state, message);
    }
    case "op.begin":
      return { ...state, ops: [...state.ops, action.op] };
    case "op.commit":
      return {
        ...state,
        ops: remove(state.ops, action.opId),
        server: state.server ? commit(state.server, action.result) : state.server,
      };
    case "op.rollback":
      return { ...state, ops: remove(state.ops, action.opId) };
    case "chat.begin":
      return {
        ...state,
        chats: [
          ...state.chats,
          {
            requestId: action.requestId,
            text: action.text,
            afterEntryId: lastEntryId(state.server),
            status: "sending",
            error: null,
          },
        ],
      };
    case "chat.accepted":
    case "chat.failed": {
      const chats = state.chats.map((chat) =>
        chat.requestId !== action.requestId
          ? chat
          : action.type === "chat.accepted"
            ? { ...chat, status: "accepted" as const }
            : { ...chat, status: "failed" as const, error: action.error },
      );
      // The user entry may have arrived before the acknowledgement.
      return { ...state, chats: state.server ? reconcileChats(chats, state.server) : chats };
    }
    case "chat.dismiss":
      return { ...state, chats: state.chats.filter((chat) => chat.requestId !== action.requestId) };
    case "decision.begin":
      return {
        ...state,
        decisions: {
          ...state.decisions,
          [action.approvalId]: { decision: action.decision, error: null },
        },
      };
    case "decision.failed": {
      const pending = state.decisions[action.approvalId];
      if (!pending) return state;
      return {
        ...state,
        decisions: { ...state.decisions, [action.approvalId]: { ...pending, error: action.error } },
      };
    }
    case "turns.loaded": {
      // Keep turns logged live after the request was sent.
      const known = new Set(action.turns.map((turn) => turn.id));
      const newer = state.turns.filter((turn) => !known.has(turn.id));
      const turns = [...newer, ...action.turns].sort((a, b) => b.at - a.at).slice(0, TURNS_KEPT);
      return { ...state, turns, turnsLoaded: true };
    }
    case "nudge.dismiss":
      return { ...state, firing: withoutKey(state.firing, action.timerId) };
  }
}
