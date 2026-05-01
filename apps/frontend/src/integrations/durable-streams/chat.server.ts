import { DurableStreamTestServer } from "@durable-streams/server";
import {
  ensureDurableChatSessionStream,
  materializeSnapshotFromDurableStream,
} from "@durable-streams/tanstack-ai-transport";
import type { UIMessage } from "@tanstack/ai";

import { DEMO_CHAT_ID, isDemoChatId } from "#/integrations/tanstack/ai/chat-session";

const DURABLE_STREAM_HOST = "127.0.0.1";
const DURABLE_STREAM_PORT = 4437;

declare global {
  var vitaskDurableStreamServerUrl: Promise<string> | undefined;
}

export async function getDemoChatSnapshot(): Promise<{
  messages: Array<UIMessage>;
  offset?: string;
}> {
  const readUrl = await ensureDemoChatStream();
  const snapshot = await materializeSnapshotFromDurableStream({ readUrl });

  return {
    messages: snapshot.messages as Array<UIMessage>,
    offset: snapshot.offset,
  };
}

export async function getDemoChatWriteTarget() {
  const writeUrl = await ensureDemoChatStream();

  return {
    writeUrl,
    createIfMissing: true,
  };
}

export async function proxyDemoChatStream(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const chatId = requestUrl.searchParams.get("id");

  if (!isDemoChatId(chatId)) {
    return Response.json({ error: "Invalid chat id." }, { status: 400 });
  }

  const upstreamUrl = new URL(await ensureDemoChatStream());

  for (const [key, value] of requestUrl.searchParams) {
    if (key !== "id") {
      upstreamUrl.searchParams.append(key, value);
    }
  }

  const upstreamResponse = await fetch(upstreamUrl, {
    headers: {
      Accept: request.headers.get("accept") ?? "application/json",
    },
    signal: request.signal,
  });
  const headers = new Headers(upstreamResponse.headers);
  headers.set("Cache-Control", "no-store");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  });
}

async function ensureDemoChatStream(): Promise<string> {
  const writeUrl = await getDemoChatStreamUrl();
  await ensureDurableChatSessionStream({ writeUrl, createIfMissing: true });
  return writeUrl;
}

async function getDemoChatStreamUrl(): Promise<string> {
  const serverUrl = await getDurableStreamServerUrl();
  return `${serverUrl}/v1/stream/${encodeURIComponent(DEMO_CHAT_ID)}`;
}

async function getDurableStreamServerUrl(): Promise<string> {
  if (!globalThis.vitaskDurableStreamServerUrl) {
    globalThis.vitaskDurableStreamServerUrl = startDurableStreamServer().catch((error: unknown) => {
      globalThis.vitaskDurableStreamServerUrl = undefined;
      throw error;
    });
  }

  return globalThis.vitaskDurableStreamServerUrl;
}

async function startDurableStreamServer(): Promise<string> {
  const server = new DurableStreamTestServer({
    host: DURABLE_STREAM_HOST,
    port: DURABLE_STREAM_PORT,
  });

  return server.start();
}
