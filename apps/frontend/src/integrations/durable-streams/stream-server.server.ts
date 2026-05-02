import { DurableStreamTestServer } from "@durable-streams/server";

const DURABLE_STREAM_HOST = "127.0.0.1";
const DURABLE_STREAM_PORT = 4437;

declare global {
  var vitaskDurableStreamServerUrl: Promise<string> | undefined;
}

export async function getDurableStreamServerUrl(): Promise<string> {
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
