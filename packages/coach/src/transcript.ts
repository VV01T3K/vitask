import type { Message } from "@earendil-works/pi-ai";
import type { EntryRecord, LiveState } from "@earendil-works/pi-durable";
import type { CoachEntry, CoachLive } from "@vitask/protocol";

/** Kind of the notices the coach writes into its own transcript (decisions, expiries). */
export const NOTICE_KIND = "vitask.notice";

function contentText(content: Message["content"] | undefined): string {
  if (content === undefined) return "";
  if (typeof content === "string") return content;
  return content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim();
}

/** A transcript entry as the UI shows it; undefined for bookkeeping entries (system prompt, thinking only). */
export function toCoachEntry(entry: EntryRecord): CoachEntry | undefined {
  const message = entry.model?.[0];
  const base = { id: Number(entry.id), toolCalls: [], toolName: null, isError: false };
  switch (entry.kind) {
    case "pi.user":
      return { ...base, role: "user", text: contentText(message?.content) };
    case "pi.assistant": {
      if (message?.role !== "assistant") return undefined;
      const toolCalls = message.content.flatMap((block) =>
        block.type === "toolCall"
          ? [{ id: block.id, name: block.name, args: block.arguments }]
          : [],
      );
      const text = contentText(message.content);
      if (text === "" && toolCalls.length === 0) {
        return message.stopReason === "error"
          ? { ...base, role: "notice", text: "The coach could not answer.", isError: true }
          : undefined;
      }
      return { ...base, role: "assistant", text, toolCalls };
    }
    case "pi.tool-result":
      if (message?.role !== "toolResult") return undefined;
      return {
        ...base,
        role: "tool",
        text: contentText(message.content),
        toolName: message.toolName,
        isError: message.isError,
      };
    case "pi.reset":
      return {
        ...base,
        role: "notice",
        text: "The coach starts a fresh context, carrying the session's handoff.",
      };
    case "pi.compaction":
      return { ...base, role: "notice", text: "Earlier conversation was summarized." };
    case NOTICE_KIND:
      return { ...base, role: "notice", text: typeof entry.data === "string" ? entry.data : "" };
    default:
      return undefined;
  }
}

export function toCoachLive(live: LiveState | undefined): CoachLive {
  const partial = live?.generation?.message;
  const partialText =
    partial === undefined
      ? ""
      : partial.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
  const failure = live?.runFailure;
  return {
    busy: live?.run !== undefined,
    partialText,
    tools: (live?.tools ?? []).map((slot) => {
      const details = slot.details;
      const approvalId =
        details !== null &&
        typeof details === "object" &&
        !Array.isArray(details) &&
        typeof details.approvalId === "string"
          ? details.approvalId
          : null;
      return { callId: slot.callId, name: slot.name, status: slot.status, approvalId };
    }),
    failure:
      failure === undefined
        ? null
        : failure.detail
          ? `${failure.reason}: ${failure.detail}`
          : failure.reason,
  };
}
