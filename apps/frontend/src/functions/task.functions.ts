import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  appendSessionEvent,
  getSessionSnapshot,
} from "#/integrations/durable-streams/session.server";
import { generateText } from "#/integrations/tanstack/ai/groq.server";

export const generateTaskHypeFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ title: z.string().min(1), taskId: z.string(), taskTitle: z.string() }))
  .handler(async ({ data }) => {
    const snapshot = await getSessionSnapshot();
    if (snapshot.taskHypes[data.taskId]) return snapshot.taskHypes[data.taskId];
    const result = await generateText({
      systemPrompt:
        "You are a witty, dynamic AI productivity coach. Your goal is to generate a highly engaging, 1 to 2 sentence micro celebration for a completed task. Subtly match the effort implicitly required by the task. Be punchy, clever, and uplifting. Avoid generic cliches like 'Great job' or 'Keep it up'. Tone: Modern, energetic, and slightly playful. CRITICAL: Do not use em dashes or spaced hyphens in your output.",
      userPrompt: `The user just crushed this task: "${data.title}". Give them a quick, clever dose of positive reinforcement to keep their momentum going. Return only the message, no quotes.`,
      fallback: `Task cleared: "${data.title}". Momentum secured.`,
      maxTokens: 500,
    });
    await appendSessionEvent({
      type: "task-hype",
      taskId: data.taskId,
      taskTitle: data.taskTitle,
      result,
    });
    return result;
  });
