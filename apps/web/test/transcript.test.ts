import { describe, expect, it } from "vite-plus/test";

import { buildTranscript } from "../src/state/transcript.ts";
import { approval, entry, snapshot } from "./fixtures.ts";

const call = { id: "c1", name: "add_task", args: { title: "Stretch" } };
const coach = snapshot().coach;

describe("buildTranscript", () => {
  it("folds a tool result into its call and pairs the approval through the result", () => {
    const snap = snapshot({
      approvals: [approval({ status: "applied" })],
      coach: {
        ...coach,
        entries: [
          entry({ id: 1, text: "add stretch" }),
          entry({ id: 2, role: "assistant", text: "", toolCalls: [call] }),
          entry({
            id: 3,
            role: "tool",
            text: "Added",
            toolName: "add_task",
            toolCallId: "c1",
            approvalId: "a1",
          }),
          entry({ id: 4, role: "assistant", text: "Done." }),
        ],
      },
    });
    const items = buildTranscript(snap, []);
    expect(items.map((item) => item.kind)).toEqual(["user", "assistant", "assistant"]);
    const tools = items[1]?.kind === "assistant" ? items[1].tools : [];
    expect(tools[0]).toMatchObject({
      status: "done",
      result: "Added",
      approval: { id: "a1", status: "applied" },
    });
  });

  it("shows a waiting call with its pending approval while the coach runs", () => {
    const snap = snapshot({
      approvals: [approval()],
      coach: {
        ...coach,
        entries: [entry({ id: 2, role: "assistant", text: "", toolCalls: [call] })],
        live: {
          busy: true,
          partialText: "",
          tools: [{ callId: "c1", name: "add_task", status: "running", approvalId: "a1" }],
          failure: null,
        },
      },
    });
    const items = buildTranscript(snap, []);
    const first = items[0];
    expect(first?.kind === "assistant" && first.tools[0]).toMatchObject({
      status: "waiting",
      approval: { id: "a1" },
    });
    // The approval is shown once, with its call, not again at the end.
    expect(items.filter((item) => item.kind === "approval")).toEqual([]);
    // Waiting on the user is not "thinking".
    expect(items.map((item) => item.kind)).toEqual(["assistant"]);
  });

  it("matches an approval on its arguments when no id links them yet", () => {
    const snap = snapshot({
      approvals: [approval({ args: { title: "Stretch" } })],
      coach: {
        ...coach,
        entries: [entry({ id: 2, role: "assistant", text: "", toolCalls: [call] })],
      },
    });
    const item = buildTranscript(snap, [])[0];
    expect(item?.kind === "assistant" && item.tools[0]?.approval?.id).toBe("a1");
  });

  it("lists pending chats as queued while the coach is busy, and unmatched pending approvals last", () => {
    const snap = snapshot({
      approvals: [approval({ id: "a9", tool: "set_timer", args: {} })],
      coach: { ...coach, live: { busy: true, partialText: "Hm", tools: [], failure: null } },
    });
    const chat = {
      requestId: "r",
      text: "also this",
      afterEntryId: 0,
      status: "accepted" as const,
      error: null,
    };
    const items = buildTranscript(snap, [chat]);
    expect(items.map((item) => item.kind)).toEqual(["pending", "live", "approval"]);
    expect(items[0]?.kind === "pending" && items[0].queued).toBe(true);
  });

  it("explains a failed run", () => {
    const snap = snapshot({
      coach: {
        ...coach,
        live: { busy: false, partialText: "", tools: [], failure: "provider_error" },
      },
    });
    expect(buildTranscript(snap, [])).toEqual([
      { kind: "notice", key: "failure", text: "The coach stopped: provider_error", isError: true },
    ]);
  });
});
