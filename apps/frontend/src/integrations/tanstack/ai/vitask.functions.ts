import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  appendSessionEvent,
  getSessionSnapshot,
  readAllSessionEvents,
  resetSession,
} from "#/integrations/durable-streams/session.server";

import { generateVitaskText } from "./vitask.server";

export const generateTaskHypeFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ title: z.string().min(1), taskId: z.string(), taskTitle: z.string() }))
  .handler(async ({ data }) => {
    const snapshot = await getSessionSnapshot();
    if (snapshot.taskHypes[data.taskId]) return snapshot.taskHypes[data.taskId];
    const result = await generateVitaskText({
      systemPrompt:
        "You write very short celebratory messages for finishing a task in a focused productivity app. Keep it to 1 or 2 sentences, playful but not cringey.",
      userPrompt: `Write a quick completion message for this task: ${data.title}`,
      fallback: `Locked in. "${data.title}" is done.`,
      maxTokens: 80,
    });
    await appendSessionEvent({
      type: "task-hype",
      taskId: data.taskId,
      taskTitle: data.taskTitle,
      result,
    });
    return result;
  });

export const generateTimerNudgeFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      timerId: z.string(),
      timerTitle: z.string().min(1),
      timerDescription: z.string().min(1),
      aiInstructions: z.string().min(1),
      completedTaskCount: z.number().int().nonnegative(),
    }),
  )
  .handler(async ({ data }) => {
    const snapshot = await getSessionSnapshot();
    if (snapshot.timerNudges[data.timerId]) return snapshot.timerNudges[data.timerId];
    const result = await generateVitaskText({
      systemPrompt:
        "You write short wellness timer nudges for a productivity app. Be concise, encouraging, and actionable.",
      userPrompt: [
        `Timer title: ${data.timerTitle}`,
        `Timer description: ${data.timerDescription}`,
        `Custom instructions: ${data.aiInstructions}`,
        `Completed tasks this session: ${data.completedTaskCount}`,
        "Write a 1 or 2 sentence nudge.",
      ].join("\n"),
      fallback: `${data.timerDescription} Take a quick reset, then get back to it.`,
      maxTokens: 90,
    });
    await appendSessionEvent({
      type: "timer-nudge",
      timerId: data.timerId,
      timerTitle: data.timerTitle,
      result,
    });
    return result;
  });

export const generateTimerInstructionsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      title: z.string().min(1),
      description: z.string(),
      activeTaskTitles: z.array(z.string()),
    }),
  )
  .handler(async ({ data }) =>
    generateVitaskText({
      systemPrompt:
        "You write timer instructions for a productivity app. Output plain text only. Keep it practical, direct, and under 3 short sentences.",
      userPrompt: [
        `Timer title: ${data.title}`,
        `Timer description: ${data.description || "(none)"}`,
        `Current active tasks: ${data.activeTaskTitles.join(", ") || "(none)"}`,
        "Write the instruction text that should be used when this timer fires.",
      ].join("\n"),
      fallback: `When this fires, remind me to ${data.title.toLowerCase()} and take a short reset before jumping back in.`,
      maxTokens: 120,
    }),
  );

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

    const result = await generateVitaskText({
      systemPrompt:
        "You write short end-of-session debriefs for a productivity app. Use the tasks, timers, and session events for specific, personal details. Keep it warm, lightly witty, 2–3 sentences.",
      userPrompt,
      fallback: `Session complete. ${data.firedCount} timers, ${data.minutes} minutes. Nice work.`,
      maxTokens: 160,
    });

    resetSession();
    return result;
  });
