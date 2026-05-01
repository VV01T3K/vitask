import { toDurableChatSessionResponse } from "@durable-streams/tanstack-ai-transport";
import { chat } from "@tanstack/ai";
import type { ConstrainedModelMessage, UIMessage } from "@tanstack/ai";
import { createGroqText } from "@tanstack/ai-groq";
import type { GroqMessageMetadataByModality } from "@tanstack/ai-groq";
import { createFileRoute } from "@tanstack/react-router";

import {
  getDemoChatWriteTarget,
  proxyDemoChatStream,
} from "#/integrations/durable-streams/chat.server";
import { isDemoChatId } from "#/integrations/tanstack/ai/chat-session";

const GROQ_MODEL = "openai/gpt-oss-120b";
type GroqTextMessage = ConstrainedModelMessage<{
  inputModalities: ["text"];
  messageMetadataByModality: GroqMessageMetadataByModality;
}>;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      GET: async ({ request }) => proxyDemoChatStream(request),
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const chatId = url.searchParams.get("id");

        if (!isDemoChatId(chatId)) {
          return Response.json({ error: "Invalid chat id." }, { status: 400 });
        }

        const apiKey = process.env.GROQ_API_KEY;

        if (!apiKey) {
          return Response.json(
            {
              error: "Set GROQ_API_KEY on the server to use Groq chat.",
            },
            {
              status: 500,
              statusText: "Missing GROQ_API_KEY",
            },
          );
        }

        const body = (await request.json()) as { messages?: Array<UIMessage> };
        const uiMessages = body.messages ?? [];
        const latestUserMessage = findLatestUserMessage(uiMessages);

        if (!latestUserMessage) {
          return Response.json({ error: "Expected at least one user message." }, { status: 400 });
        }

        const messages = toGroqTextMessages(uiMessages);
        const abortController = new AbortController();

        const responseStream = chat({
          adapter: createGroqText(GROQ_MODEL, apiKey),
          messages,
          systemPrompts: [
            "You are a concise, helpful assistant. Answer clearly and keep responses easy to scan.",
          ],
          abortController,
        });

        return toDurableChatSessionResponse({
          stream: await getDemoChatWriteTarget(),
          newMessages: [latestUserMessage],
          responseStream,
        });
      },
    },
  },
});

function findLatestUserMessage(messages: Array<UIMessage>): UIMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message?.role === "user") {
      return message;
    }
  }

  return undefined;
}

function toGroqTextMessages(messages: Array<UIMessage>): Array<GroqTextMessage> {
  return messages.flatMap((message) => {
    if (message.role === "system") {
      return [];
    }

    const content = message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.content)
      .join("");

    if (!content.trim()) {
      return [];
    }

    return [{ role: message.role, content }];
  });
}
