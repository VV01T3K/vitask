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
      timers: z.array(z.object({ title: z.string(), description: z.string() })),
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
      .map((t) => `- ${t.title}: ${t.description || "(no description)"}`)
      .join("\n");

    const userPrompt = [
      `Tasks:\n${taskLines || "(none)"}`,
      `Timers:\n${timerLines || "(none)"}`,
      `Stats: ${data.firedCount} timers fired, ${data.snoozedCount} snoozed, ${data.minutes} min`,
      `Session events:\n${eventLines || "(no AI events recorded)"}`,
    ].join("\n\n");

    const result = await generateText({
      systemPrompt:
        "You write short end-of-session debriefs for a productivity app. Use the tasks, timers, and session events for specific, personal details. Keep it warm, lightly witty, 2–3 sentences.",
      userPrompt,
      fallback: `Session complete. ${data.firedCount} timers, ${data.minutes} minutes. Nice work.`,
      maxTokens: 500,
    });

    resetSession();
    return result;
  });
