import type { Approval, CoachEntry, Snapshot } from "@vitask/protocol";

import type { PendingChat } from "./types.ts";

export type ToolStatus = "running" | "waiting" | "done" | "error" | "stopped";

export type ToolView = {
  callId: string;
  name: string;
  args: unknown;
  status: ToolStatus;
  result: string | null;
  approval: Approval | null;
};

export type TranscriptItem =
  | { kind: "user"; key: string; text: string }
  | { kind: "assistant"; key: string; text: string; tools: ToolView[] }
  | { kind: "notice"; key: string; text: string; isError: boolean }
  | { kind: "pending"; key: string; chat: PendingChat; queued: boolean }
  | { kind: "live"; key: string; text: string; tools: ToolView[] }
  | { kind: "approval"; key: string; approval: Approval };

/** JSON with sorted keys, to compare tool arguments with an approval's. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );
}

/**
 * The coach conversation as display items: tool results folded into the call that made them, each gated call
 * paired with its approval, chats still on their way, and what the coach is doing right now.
 */
export function buildTranscript(snapshot: Snapshot, chats: PendingChat[]): TranscriptItem[] {
  const { entries, live } = snapshot.coach;
  const approvals = new Map(snapshot.approvals.map((approval) => [approval.id, approval]));
  const results = new Map<string, CoachEntry>();
  for (const entry of entries)
    if (entry.role === "tool" && entry.toolCallId) results.set(entry.toolCallId, entry);
  const liveTools = new Map(live.tools.map((tool) => [tool.callId, tool]));
  const claimed = new Set<string>();
  const allCalls = new Set(entries.flatMap((entry) => entry.toolCalls.map((call) => call.id)));

  const approvalFor = (name: string, args: unknown, id: string | null): Approval | null => {
    let approval = id ? approvals.get(id) : undefined;
    // Before the result is in, match on the arguments the approval is bound to.
    approval ??= snapshot.approvals.find(
      (candidate) =>
        !claimed.has(candidate.id) &&
        candidate.tool === name &&
        canonical(candidate.args) === canonical(args),
    );
    if (!approval) return null;
    claimed.add(approval.id);
    return approval;
  };

  const toolView = (call: { id: string; name: string; args: unknown }): ToolView => {
    const result = results.get(call.id);
    const running = liveTools.get(call.id);
    const status: ToolStatus = result
      ? result.isError
        ? "error"
        : "done"
      : running
        ? running.approvalId
          ? "waiting"
          : "running"
        : live.busy
          ? "running"
          : "stopped";
    return {
      callId: call.id,
      name: call.name,
      args: call.args,
      status,
      result: result?.text ?? null,
      approval: approvalFor(
        call.name,
        call.args,
        result?.approvalId ?? running?.approvalId ?? null,
      ),
    };
  };

  const items: TranscriptItem[] = [];
  const committedCalls = new Set<string>();
  for (const entry of entries) {
    const key = `entry-${entry.id}`;
    switch (entry.role) {
      case "user":
        items.push({ kind: "user", key, text: entry.text });
        break;
      case "assistant":
        for (const call of entry.toolCalls) committedCalls.add(call.id);
        items.push({
          kind: "assistant",
          key,
          text: entry.text,
          tools: entry.toolCalls.map(toolView),
        });
        break;
      case "notice":
        items.push({ kind: "notice", key, text: entry.text, isError: entry.isError });
        break;
      case "tool":
        // Shown with its call; a result without one (an older transcript) stands alone.
        if (!entry.toolCallId || !allCalls.has(entry.toolCallId))
          items.push({
            kind: "assistant",
            key,
            text: "",
            tools: [
              {
                callId: entry.toolCallId ?? key,
                name: entry.toolName ?? "tool",
                args: null,
                status: entry.isError ? "error" : "done",
                result: entry.text,
                approval: entry.approvalId ? (approvals.get(entry.approvalId) ?? null) : null,
              },
            ],
          });
        break;
    }
  }

  for (const chat of chats)
    items.push({
      kind: "pending",
      key: `chat-${chat.requestId}`,
      chat,
      queued: live.busy && chat.status === "accepted",
    });

  const uncommitted = live.tools.filter((tool) => !committedCalls.has(tool.callId));
  // While a call waits for the user, the coach is not thinking: its approval card says what happens next.
  const waitingOnUser = live.tools.some((tool) => tool.approvalId !== null);
  if (live.busy && (live.partialText !== "" || uncommitted.length > 0 || !waitingOnUser)) {
    items.push({
      kind: "live",
      key: "live",
      text: live.partialText,
      tools: uncommitted.map((tool) => toolView({ id: tool.callId, name: tool.name, args: null })),
    });
  }
  if (!live.busy && live.failure)
    items.push({
      kind: "notice",
      key: "failure",
      text: `The coach stopped: ${live.failure}`,
      isError: true,
    });

  for (const approval of snapshot.approvals)
    if (approval.status === "pending" && !claimed.has(approval.id))
      items.push({ kind: "approval", key: `approval-${approval.id}`, approval });

  return items;
}
