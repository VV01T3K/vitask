import type {
  Approval,
  CareTimer,
  CoachEntry,
  Nudge,
  Session,
  Snapshot,
  Task,
  TurnLogEntry,
} from "@vitask/protocol";

export function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Write report",
    notes: "",
    status: "open",
    parentId: null,
    estimateMinutes: null,
    order: 1,
    createdAt: 1_000,
    updatedAt: 1_000,
    completedAt: null,
    ...overrides,
  };
}

export function timer(overrides: Partial<CareTimer> = {}): CareTimer {
  return {
    id: "w1",
    label: "Water",
    purpose: "Drink some water",
    instructions: "",
    intervalSeconds: 1800,
    enabled: true,
    icon: "hydration",
    color: "#2fb7ad",
    isDefault: true,
    nextFireAt: null,
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  };
}

export function session(overrides: Partial<Session> = {}): Session {
  return {
    id: "s1",
    status: "active",
    startedAt: 1_000,
    endedAt: null,
    endReason: null,
    maxEndsAt: 1_000 + 4 * 3600_000,
    debrief: null,
    debriefSource: null,
    ...overrides,
  };
}

export function nudge(overrides: Partial<Nudge> = {}): Nudge {
  return {
    id: "n1",
    sessionId: "s1",
    timerId: "w1",
    timerLabel: "Water",
    message: "Sip some water.",
    source: "ai",
    firedAt: 5_000,
    ...overrides,
  };
}

export function approval(overrides: Partial<Approval> = {}): Approval {
  return {
    id: "a1",
    tool: "add_task",
    args: { title: "Stretch" },
    summary: 'Add task "Stretch"',
    status: "pending",
    createdAt: 2_000,
    expiresAt: 602_000,
    decidedAt: null,
    result: null,
    ...overrides,
  };
}

export function entry(overrides: Partial<CoachEntry> = {}): CoachEntry {
  return {
    id: 1,
    role: "user",
    at: 1_000,
    text: "hi",
    toolCalls: [],
    toolName: null,
    toolCallId: null,
    approvalId: null,
    isError: false,
    ...overrides,
  };
}

export function turn(overrides: Partial<TurnLogEntry> = {}): TurnLogEntry {
  return {
    id: "turn1",
    at: 3_000,
    trigger: "chat",
    conversationId: null,
    runId: null,
    provider: "groq",
    model: "openai/gpt-oss-120b",
    inputTokens: 100,
    outputTokens: 20,
    cacheReadTokens: 0,
    costUsd: 0.0001,
    latencyMs: 400,
    toolCalls: [],
    outcome: "ok",
    error: null,
    ...overrides,
  };
}

export function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    protocol: 1,
    tasks: [task()],
    timers: [timer()],
    session: null,
    nudges: [],
    hypes: [],
    approvals: [],
    memory: [],
    plan: null,
    coach: {
      model: "groq/openai/gpt-oss-120b",
      entries: [],
      live: { busy: false, partialText: "", tools: [], failure: null },
    },
    budget: { dailyTokenLimit: 200_000, tokensUsedToday: 0, chatPerMinute: 10 },
    ...overrides,
  };
}
