import {
  defineExtension,
  defineTool,
  GenerationTask,
  hook,
  LiveDoc,
  section,
  type Extension,
} from "@earendil-works/pi-durable";
import { obj, oneOf, opt, str } from "@earendil-works/pi-schema";
import { LIMITS } from "@vitask/protocol";

import type { CoachDeps } from "./deps.ts";
import { approvalPolicyHook, gatedTools } from "./gate.ts";
import { logTurn, turnFromMessage } from "./generate.ts";
import { COACH_ROLE, COACH_RULES, memorySection, userData } from "./prompts.ts";

const text = (value: string) => ({ output: [{ type: "text" as const, text: value }] });

function readTools(deps: CoachDeps) {
  const { store } = deps;
  return [
    defineTool({
      name: "list_tasks",
      description: "List the user's tasks and steps (parentId set), in display order.",
      parameters: obj({ status: opt(oneOf(["open", "done", "all"])) }),
      replay: "safe",
      execute: async (args) => {
        const status = args.status ?? "all";
        const tasks = (await store.listTasks())
          .filter((task) => status === "all" || task.status === status)
          .map(({ id, title, notes, status: s, parentId, estimateMinutes }) => ({
            id,
            title,
            notes: notes || undefined,
            status: s,
            parentId: parentId ?? undefined,
            estimateMinutes: estimateMinutes ?? undefined,
          }));
        return text(tasks.length === 0 ? "No tasks." : userData("tasks", tasks));
      },
    }),
    defineTool({
      name: "list_timers",
      description: "List the user's care timers (breaks such as hydration or eye rest).",
      parameters: obj({}),
      replay: "safe",
      execute: async () => {
        const timers = (await store.listTimers()).map((t) => ({
          id: t.id,
          label: t.label,
          purpose: t.purpose,
          intervalMinutes: Math.round(t.intervalSeconds / 6) / 10,
          enabled: t.enabled,
          firesInMinutes:
            t.nextFireAt === null
              ? undefined
              : Math.max(0, Math.round((t.nextFireAt - deps.now()) / 60_000)),
        }));
        return text(timers.length === 0 ? "No timers." : userData("timers", timers));
      },
    }),
    defineTool({
      name: "get_session_stats",
      description: "Stats of the current focus session, or of the last one if none is active.",
      parameters: obj({}),
      replay: "safe",
      execute: async () => {
        const session = (await store.getActiveSession()) ?? (await store.getLatestSession());
        if (!session) return text("The user has not started a focus session yet.");
        const end = session.endedAt ?? deps.now();
        const tasks = await store.listTasks();
        const done = tasks.filter(
          (t) => t.completedAt !== null && t.completedAt >= session.startedAt,
        );
        const nudges = await store.listNudges(session.id);
        return text(
          JSON.stringify({
            status: session.status,
            focusMinutes: Math.round((end - session.startedAt) / 60_000),
            minutesUntilAutoEnd:
              session.status === "active"
                ? Math.round((session.maxEndsAt - deps.now()) / 60_000)
                : undefined,
            completedTasks: done.length,
            openTasks: tasks.filter((t) => t.status === "open").length,
            breaksTaken: nudges.length,
          }),
        );
      },
    }),
  ];
}

function rememberTool(deps: CoachDeps) {
  return defineTool({
    name: "remember",
    description: `Store one short durable fact about the user (a preference, a constraint, context). At most ${LIMITS.memoryFact} characters; no approval needed.`,
    parameters: obj({ fact: str({ minLength: 3, maxLength: LIMITS.memoryFact }) }),
    replay: "safe",
    callers: ["model"],
    execute: async (args, api, context) => {
      const fact = args.fact.trim().replace(/\s+/g, " ");
      const memory = await deps.store.listMemory();
      if (memory.some((m) => m.text.toLowerCase() === fact.toLowerCase()))
        return text("Already remembered.");
      if (memory.length >= LIMITS.memoryFacts) {
        return {
          ...text(`Memory is full (${LIMITS.memoryFacts} facts). Ask the user which fact to drop.`),
          isError: true,
        };
      }
      const id = await api.memo("memory.id", deps.newId("fact"), context);
      await deps.store.insertMemory({ id, text: fact, createdAt: api.now() });
      deps.publish({ type: "memory.updated", memory: await deps.store.listMemory() });
      return text("Remembered.");
    },
  });
}

/** Everything the coach conversation runs with: prompt sections, tools, the approval gate and turn logging. */
export function coachExtension(deps: CoachDeps, tasks: Extension["tasks"]): Extension {
  return defineExtension({
    name: "vitask-coach",
    sections: [
      section("role", () => COACH_ROLE, { tag: false }),
      section("rules", () => COACH_RULES),
      section("memory", async () => memorySection(await deps.store.listMemory())),
    ],
    tools: [...readTools(deps), rememberTool(deps), ...gatedTools(deps)],
    hooks: [
      approvalPolicyHook(deps),
      hook(GenerationTask, {
        afterResponse: async (message, api, context) => {
          const live = await api.snapshot(LiveDoc, api.conversationId, context);
          await logTurn(
            deps,
            turnFromMessage(deps, message, {
              trigger: "chat",
              conversationId: String(api.conversationId),
              // A run hands over between generation tasks; the submission that started it names it stably.
              runId:
                live?.run?.inputs[0] !== undefined
                  ? `submission:${live.run.inputs[0]}`
                  : `task:${api.taskId}`,
            }),
          );
        },
      }),
    ],
    tasks,
  });
}
