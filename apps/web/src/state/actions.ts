import {
  CareTimer,
  ChatBody,
  CreateTaskBody,
  CreateTimerBody,
  Session,
  Snapshot,
  Task,
  TurnLogResponse,
  UpdateTimerBody,
  type ApprovalDecision,
  type CreateTimerBody as CreateTimerInput,
  type UpdateTimerBody as UpdateTimerInput,
} from "@vitask/protocol";
import { z } from "zod";

import { toUiError, type http as httpFn } from "./api.ts";
import type { LiveSocket } from "./socket.ts";
import type { Store } from "./store.ts";
import type { Op, OpResult, UiError } from "./types.ts";

export type ActionDeps = {
  store: Store;
  http: typeof httpFn;
  socket: Pick<LiveSocket, "request">;
  now: () => number;
  newId: () => string;
  /** Shows an error that has no inline place (a failed checkbox click, a failed delete). */
  notify: (error: UiError) => void;
};

/** A schema failure as the inline error the forms show. */
function invalid(error: z.ZodError): UiError {
  return {
    code: "bad_request",
    message: error.issues[0]?.message ?? "Invalid input",
    issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  };
}

const NoContent = z.undefined();

export type Actions = ReturnType<typeof createActions>;

export function createActions({ store, http, socket, now, newId, notify }: ActionDeps) {
  const { dispatch } = store;

  /** Shows `op` at once, sends the request, then keeps the server's answer or rolls back. */
  async function optimistic<T>(
    op: Op,
    request: () => Promise<T>,
    toResult: (value: T) => OpResult,
  ): Promise<UiError | null> {
    dispatch({ type: "op.begin", op });
    try {
      dispatch({ type: "op.commit", opId: op.id, result: toResult(await request()) });
      return null;
    } catch (error) {
      dispatch({ type: "op.rollback", opId: op.id });
      return toUiError(error);
    }
  }

  const reportFailure = async (pending: Promise<UiError | null>) => {
    const error = await pending;
    if (error) notify(error);
  };

  function patchTask(taskId: string, patch: Partial<Task>, request: () => Promise<Task>) {
    return reportFailure(
      optimistic({ id: newId(), kind: "task.patch", taskId, patch }, request, (task) => ({ task })),
    );
  }

  return {
    /** Loads the first snapshot over HTTP; it also sets the workspace cookie the WebSocket needs. */
    async bootstrap(): Promise<UiError | null> {
      const sentAt = now();
      try {
        const { data, serverDate } = await http("GET", "/api/snapshot", Snapshot);
        // `Date` has whole seconds: only a skew larger than that rounding is worth correcting.
        const offset = serverDate === null ? 0 : serverDate - (sentAt + now()) / 2;
        dispatch({
          type: "snapshot",
          snapshot: data,
          clockOffsetMs: Math.abs(offset) > 1_500 ? offset : 0,
        });
        return null;
      } catch (error) {
        return toUiError(error);
      }
    },

    addTask(input: z.input<typeof CreateTaskBody>): Promise<UiError | null> {
      const parsed = CreateTaskBody.safeParse(input);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const body = { ...parsed.data, id: parsed.data.id ?? `task_${newId()}` };
      const at = now();
      const task: Task = {
        id: body.id,
        title: body.title,
        notes: body.notes ?? "",
        status: "open",
        parentId: body.parentId ?? null,
        estimateMinutes: body.estimateMinutes ?? null,
        order: Number.MAX_SAFE_INTEGER,
        createdAt: at,
        updatedAt: at,
        completedAt: null,
      };
      return optimistic(
        { id: newId(), kind: "task.create", task },
        async () => (await http("POST", "/api/tasks", Task, body)).data,
        (created) => ({ task: created }),
      );
    },

    completeTask(taskId: string) {
      return patchTask(
        taskId,
        { status: "done", completedAt: now() },
        async () => (await http("POST", `/api/tasks/${taskId}/complete`, Task)).data,
      );
    },

    reopenTask(taskId: string) {
      return patchTask(
        taskId,
        { status: "open", completedAt: null },
        async () => (await http("PATCH", `/api/tasks/${taskId}`, Task, { status: "open" })).data,
      );
    },

    setEstimate(taskId: string, estimateMinutes: number | null) {
      return patchTask(
        taskId,
        { estimateMinutes },
        async () => (await http("PATCH", `/api/tasks/${taskId}`, Task, { estimateMinutes })).data,
      );
    },

    deleteTask(taskId: string) {
      return reportFailure(
        optimistic(
          { id: newId(), kind: "task.delete", taskId },
          () => http("DELETE", `/api/tasks/${taskId}`, NoContent),
          () => ({ deletedTaskId: taskId }),
        ),
      );
    },

    /** Not optimistic: the form stays open with the server's answer. */
    async createTimer(input: CreateTimerInput): Promise<UiError | null> {
      const parsed = CreateTimerBody.safeParse(input);
      if (!parsed.success) return invalid(parsed.error);
      try {
        const { data } = await http("POST", "/api/timers", CareTimer, parsed.data);
        // No op to drop: `op.commit` only folds the answer into the server state.
        dispatch({ type: "op.commit", opId: "", result: { timer: data } });
        return null;
      } catch (error) {
        return toUiError(error);
      }
    },

    updateTimer(timerId: string, input: UpdateTimerInput): Promise<UiError | null> {
      const parsed = UpdateTimerBody.safeParse(input);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return optimistic(
        { id: newId(), kind: "timer.patch", timerId, patch: parsed.data },
        async () => (await http("PATCH", `/api/timers/${timerId}`, CareTimer, parsed.data)).data,
        (timer) => ({ timer }),
      );
    },

    deleteTimer(timerId: string) {
      dispatch({ type: "nudge.dismiss", timerId });
      return reportFailure(
        optimistic(
          { id: newId(), kind: "timer.delete", timerId },
          () => http("DELETE", `/api/timers/${timerId}`, NoContent),
          () => ({ deletedTimerId: timerId }),
        ),
      );
    },

    dismissNudge(timerId: string) {
      dispatch({ type: "nudge.dismiss", timerId });
    },

    async startSession(): Promise<UiError | null> {
      return sessionRequest("/api/session/start");
    },

    /** Resolves when the server has the debrief (or gave up waiting for it). */
    async endSession(): Promise<UiError | null> {
      return sessionRequest("/api/session/end");
    },

    async sendChat(text: string): Promise<UiError | null> {
      const requestId = newId();
      const parsed = ChatBody.safeParse({ text, requestId });
      if (!parsed.success) return invalid(parsed.error);
      dispatch({ type: "chat.begin", requestId, text: parsed.data.text });
      try {
        await socket.request({ type: "chat.send", requestId, text: parsed.data.text });
        dispatch({ type: "chat.accepted", requestId });
        return null;
      } catch (error) {
        const uiError = toUiError(error);
        dispatch({ type: "chat.failed", requestId, error: uiError });
        return uiError;
      }
    },

    dismissChat(requestId: string) {
      dispatch({ type: "chat.dismiss", requestId });
    },

    async decide(approvalId: string, decision: ApprovalDecision): Promise<void> {
      dispatch({ type: "decision.begin", approvalId, decision });
      try {
        // The `approval.upserted` event that follows clears the pending state.
        await socket.request({ type: "approval.decide", requestId: newId(), approvalId, decision });
      } catch (error) {
        dispatch({ type: "decision.failed", approvalId, error: toUiError(error) });
      }
    },

    async loadTurns(): Promise<UiError | null> {
      try {
        const { data } = await http("GET", "/api/turns?limit=100", TurnLogResponse);
        dispatch({ type: "turns.loaded", turns: data.turns });
        return null;
      } catch (error) {
        return toUiError(error);
      }
    },
  };

  async function sessionRequest(path: string): Promise<UiError | null> {
    try {
      const { data } = await http("POST", path, Session);
      dispatch({ type: "message", message: { type: "session.updated", session: data } });
      return null;
    } catch (error) {
      return toUiError(error);
    }
  }
}
