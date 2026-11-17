import { describe, expect, it } from "vite-plus/test";

import {
  ApiError,
  ChatBody,
  ClientMessage,
  CreateTaskBody,
  CreateTimerBody,
  ServerMessage,
  UpdateTaskBody,
} from "../src/index.ts";

describe("HTTP bodies", () => {
  it("accepts valid input and trims titles", () => {
    expect(CreateTaskBody.parse({ title: "  Write  ", estimateMinutes: 25 })).toEqual({
      title: "Write",
      estimateMinutes: 25,
    });
    expect(CreateTimerBody.parse({ label: "Water", intervalSeconds: 600 }).label).toBe("Water");
  });

  it("rejects unknown fields, empty updates and oversized text", () => {
    expect(CreateTaskBody.safeParse({ title: "x", status: "done" }).success).toBe(false);
    expect(UpdateTaskBody.safeParse({}).success).toBe(false);
    expect(ChatBody.safeParse({ text: "x".repeat(4001), requestId: "request-1" }).success).toBe(
      false,
    );
    expect(
      CreateTimerBody.safeParse({ label: "x", intervalSeconds: 600, color: "red" }).success,
    ).toBe(false);
  });
});

describe("WebSocket messages", () => {
  it("parses commands and rejects unknown types", () => {
    expect(
      ClientMessage.parse({ type: "chat.send", requestId: "request-1", text: "hi" }).type,
    ).toBe("chat.send");
    expect(
      ClientMessage.safeParse({
        type: "approval.decide",
        requestId: "request-2",
        approvalId: "a",
        decision: "maybe",
      }).success,
    ).toBe(false);
    expect(ClientMessage.safeParse({ type: "drop_tables" }).success).toBe(false);
  });

  it("describes server events and errors", () => {
    const live = {
      type: "coach.live",
      live: { busy: true, partialText: "Hel", tools: [], failure: null },
    };
    expect(ServerMessage.parse(live)).toEqual(live);
    const error = {
      type: "error",
      requestId: null,
      error: { code: "rate_limited", message: "slow down", retryAfterMs: 1000 },
    };
    expect(ServerMessage.parse(error)).toEqual(error);
    expect(ApiError.safeParse({ error: { code: "teapot", message: "?" } }).success).toBe(false);
  });
});
