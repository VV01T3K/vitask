import { DurableStream, DurableStreamError, stream } from "@durable-streams/client";

import { getDurableStreamServerUrl } from "#/integrations/durable-streams/stream-server.server";

export type SessionEvent =
  | { type: "timer-nudge"; timerId: string; timerTitle: string; result: string }
  | { type: "task-hype"; taskId: string; taskTitle: string; result: string };

export type SessionSnapshot = {
  timerNudges: Record<string, string>;
  taskHypes: Record<string, string>;
};

declare global {
  var vitaskSessionId: string | undefined;
}

function getOrCreateSessionId(): string {
  return (globalThis.vitaskSessionId ??= crypto.randomUUID());
}

async function getSessionStreamUrl(): Promise<string> {
  const serverUrl = await getDurableStreamServerUrl();
  return `${serverUrl}/v1/stream/${encodeURIComponent(`vitask-session-${getOrCreateSessionId()}`)}`;
}

let snapshotPromise: Promise<SessionSnapshot> | undefined;

export async function getSessionSnapshot(): Promise<SessionSnapshot> {
  return (snapshotPromise ??= (async () => {
    const url = await getSessionStreamUrl();
    const handle = new DurableStream({ url, contentType: "application/json", warnOnHttp: false });
    try {
      await handle.create();
    } catch (err) {
      if (!(err instanceof DurableStreamError) || err.code !== "CONFLICT_EXISTS") throw err;
    }
    const snapshot: SessionSnapshot = { timerNudges: {}, taskHypes: {} };
    try {
      const res = await stream<SessionEvent>({ url, offset: "-1", live: false, warnOnHttp: false });
      for (const e of await res.json()) applyEvent(snapshot, e);
    } catch {
      // empty stream on first run
    }
    return snapshot;
  })());
}

function applyEvent(s: SessionSnapshot, e: SessionEvent): void {
  if (e.type === "timer-nudge") s.timerNudges[e.timerId] = e.result;
  else if (e.type === "task-hype") s.taskHypes[e.taskId] = e.result;
}

export async function appendSessionEvent(event: SessionEvent): Promise<void> {
  const snapshot = await getSessionSnapshot();
  applyEvent(snapshot, event);
  const url = await getSessionStreamUrl();
  await new DurableStream({ url, contentType: "application/json", warnOnHttp: false }).append(
    JSON.stringify(event),
  );
}

export async function readAllSessionEvents(): Promise<SessionEvent[]> {
  const url = await getSessionStreamUrl();
  try {
    const res = await stream<SessionEvent>({ url, offset: "-1", live: false, warnOnHttp: false });
    return await res.json();
  } catch {
    return [];
  }
}

export function resetSession(): void {
  globalThis.vitaskSessionId = crypto.randomUUID();
  snapshotPromise = undefined;
}
