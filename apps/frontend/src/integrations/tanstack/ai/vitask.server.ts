import { chat } from "@tanstack/ai";
import { createGroqText } from "@tanstack/ai-groq";

const GROQ_MODEL = "openai/gpt-oss-120b";

type GenerateVitaskTextOptions = {
  systemPrompt: string;
  userPrompt: string;
  fallback: string;
  maxTokens?: number;
};

export async function generateVitaskText({
  systemPrompt,
  userPrompt,
  fallback,
  maxTokens = 180,
}: GenerateVitaskTextOptions): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return fallback;
  }

  try {
    const response = await chat({
      adapter: createGroqText(GROQ_MODEL, apiKey),
      systemPrompts: [systemPrompt],
      messages: [{ role: "user", content: userPrompt }],
      maxTokens,
      stream: false,
    });

    return typeof response === "string" && response.trim() ? response.trim() : fallback;
  } catch {
    return fallback;
  }
}
