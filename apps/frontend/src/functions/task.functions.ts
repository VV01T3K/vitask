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
        "You write very short celebratory messages for finishing a task in a focused productivity app. Keep it to 1 or 2 sentences, playful but not cringey.",
      userPrompt: `Write a quick completion message for this task: ${data.title}`,
      fallback: `Locked in. "${data.title}" is done.`,
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
