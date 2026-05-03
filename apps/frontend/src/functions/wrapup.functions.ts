import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { readAllSessionEvents, resetSession } from "#/integrations/durable-streams/session.server";
import { generateText } from "#/integrations/tanstack/ai/groq.server";

export const generateWrapUpFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      firedCount: z.number().int().nonnegative(),
      snoozedCount: z.number().int().nonnegative(),
      minutes: z.number().int().nonnegative(),
      tasks: z.array(z.object({ title: z.string(), isCompleted: z.boolean() })),
      timers: z.array(
        z.object({
          title: z.string(),
          description: z.string(),
          status: z.enum(["fired", "snoozed", "unused"]),
        }),
      ),
    }),
  )
  .handler(async ({ data }) => {
    const events = await readAllSessionEvents();

    const eventLines = events
      .map((e) => {
        if (e.type === "timer-nudge") return `Timer "${e.timerTitle}" fired → nudge: "${e.result}"`;
        if (e.type === "task-hype") return `Task completed: "${e.taskTitle}" → hype: "${e.result}"`;
      })
      .join("\n");

    const taskLines = data.tasks
      .map((t) => `${t.isCompleted ? "[x]" : "[ ]"} ${t.title}`)
      .join("\n");

    const timerLines = data.timers
      .map((t) => {
        const statusLabel = t.status === "fired" ? "🔥" : t.status === "snoozed" ? "💤" : "○";
        return `${statusLabel} ${t.title}: ${t.description || "(no description)"}`;
      })
      .join("\n");

    const userPrompt = `Session data:
Tasks completed: ${taskLines || "none"}
Timers used: ${timerLines || "none"}
Stats: ${data.firedCount} timers fired, ${data.snoozedCount} snoozed, ${data.minutes} total minutes of focus.
Recent session notes: ${eventLines || "none"}

Write a personalized, intelligent narrative debrief that makes the user feel accomplished and centered. Do not just list the stats; weave them into a satisfying conclusion.`;

    const result = await generateText({
      systemPrompt:
        "You are a sophisticated well being and productivity coach summarizing a user's remote work session. Synthesize their completed tasks, timer history, and recent interactions into a cohesive, warm, and lightly witty 2 to 3 sentence debrief. Focus on the value of their focused work and the balance they maintained. Output plain text only. CRITICAL: Do not use em dashes or spaced hyphens in your output.",
      userPrompt,
      fallback: `Session complete: ${data.minutes} minutes of focus and ${data.firedCount} timers. Excellent balance of deep work and vital resets today.`,
      maxTokens: 500,
    });

    resetSession();
    return result;
  });
