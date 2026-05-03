import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  appendSessionEvent,
  getSessionSnapshot,
} from "#/integrations/durable-streams/session.server";
import { generateText } from "#/integrations/tanstack/ai/groq.server";

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
    const result = await generateText({
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
      maxTokens: 500,
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
    generateText({
      systemPrompt:
        "You write timer instructions for a productivity app. Output plain text only. Keep it practical, direct, and under 3 short sentences.",
      userPrompt: [
        `Timer title: ${data.title}`,
        `Timer description: ${data.description || "(none)"}`,
        `Current active tasks: ${data.activeTaskTitles.join(", ") || "(none)"}`,
        "Write the instruction text that should be used when this timer fires.",
      ].join("\n"),
      fallback: `When this fires, remind me to ${data.title.toLowerCase()} and take a short reset before jumping back in.`,
      maxTokens: 500,
    }),
  );
