import { chat } from "@tanstack/ai";
import { createGroqText } from "@tanstack/ai-groq";

const GROQ_MODELS = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile"] as const;

type GenerateTextOptions = {
  systemPrompt: string;
  userPrompt: string;
  fallback: string;
  maxTokens?: number;
};

export async function generateText({
  systemPrompt,
  userPrompt,
  fallback,
  maxTokens = 500,
}: GenerateTextOptions): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return fallback;
  }

  for (const model of GROQ_MODELS) {
    try {
      const response = await chat({
        adapter: createGroqText(model, apiKey),
        systemPrompts: [systemPrompt],
        messages: [{ role: "user", content: userPrompt }],
        maxTokens,
        stream: false,
      });

      if (typeof response === "string" && response.trim()) {
        return response.trim();
      }
    } catch {
      // try next model
    }
  }

  return fallback;
}
