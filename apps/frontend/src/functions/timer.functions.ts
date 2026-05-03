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
        "You are a well being and healthy habits expert integrated into a work app. Craft a 1 to 2 sentence wellness nudge to help the user reset during a break. Focus on actionable micro habits (e.g., eye rest, stretching, posture, deep breaths) without sounding purely clinical. Tone: Empathetic, grounding, warmly encouraging, and highly specific. CRITICAL: Do not use em dashes or spaced hyphens in your output.",
      userPrompt: `Context: The timer "${data.timerTitle}" just finished. Description: ${data.timerDescription}. Custom instructions: ${data.aiInstructions}. The user has completed ${data.completedTaskCount} tasks this session. Write a 1 to 2 sentence well being nudge that encourages healthy recovery before they return to work.`,
      fallback: `${data.timerDescription || data.timerTitle} Stand up, stretch your shoulders, and take a deep breath before diving back in.`,
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
        "You are a precise, highly articulate AI system guiding a user through their workflow. Convert timer contexts into direct, actionable instructions. Be exceptionally clear, practical, and limit yourself to a maximum of 3 short sentences. Output plain text only without markdown, formatting, or conversational filler. CRITICAL: Do not use em dashes or spaced hyphens in your output.",
      userPrompt: `Timer alert: "${data.title}". Description: ${data.description}. Currently active tasks, if any: [${data.activeTaskTitles.join(", ")}]. Write the exact, plain spoken instruction the user should read or hear right now to transition smoothly.`,
      fallback: `Timer "${data.title}" is complete. Take a brief reset before resuming your active tasks.`,
      maxTokens: 500,
    }),
  );
