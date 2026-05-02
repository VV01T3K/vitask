import { durableStreamConnection } from "@durable-streams/tanstack-ai-transport";
import { useChat } from "@tanstack/ai-react";
import type { UIMessage } from "@tanstack/ai-react";
import { createFileRoute } from "@tanstack/react-router";
import { LoaderCircle, Send, Square } from "lucide-react";
import { useMemo, useState } from "react";

import { getDemoChatSnapshotFn } from "#/integrations/tanstack/ai/chat.functions";

const CHAT_ID = "vitask-demo-chat";

export const Route = createFileRoute("/demo/ai")({
  loader: () => getDemoChatSnapshotFn(),
  component: AiRoute,
});

function AiRoute() {
  const { messages: initialMessages, offset } = Route.useLoaderData();
  const [input, setInput] = useState("");
  const connection = useMemo(
    () =>
      durableStreamConnection({
        sendUrl: `/api/chat?id=${encodeURIComponent(CHAT_ID)}`,
        readUrl: `/api/chat?id=${encodeURIComponent(CHAT_ID)}`,
        initialOffset: offset,
      }),
    [offset],
  );
  const { messages, sendMessage, isLoading, error, stop, sessionGenerating } = useChat({
    id: CHAT_ID,
    connection,
    initialMessages,
    live: true,
  });
  const isBusy = isLoading || sessionGenerating;

  const canSubmit = input.trim().length > 0 && !isBusy;

  async function handleSubmit() {
    const nextMessage = input.trim();

    if (!nextMessage || isBusy) {
      return;
    }

    setInput("");
    await sendMessage(nextMessage);
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-9rem)] w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <section className="space-y-2">
        <p className="text-sm font-medium tracking-[0.18em] text-cyan-700 uppercase dark:text-cyan-300">
          Durable Groq streaming
        </p>
        <h1 className="text-3xl font-semibold text-zinc-950 dark:text-zinc-50">
          Ask the assistant
        </h1>
      </section>

      <section
        aria-live="polite"
        className="flex min-h-80 flex-1 flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        {messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-center text-sm text-zinc-500 dark:text-zinc-400">
            Send a prompt to see the response stream in here.
          </div>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
      </section>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200">
          {error.message}
        </p>
      ) : null}

      <form
        className="flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <textarea
          className="min-h-24 flex-1 resize-none rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-950 transition outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-cyan-300"
          disabled={isBusy}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder="Type a message..."
          value={input}
        />
        {isLoading ? (
          <button
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-5 font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-300"
            onClick={stop}
            type="button"
          >
            <Square aria-hidden="true" size={18} />
            Stop
          </button>
        ) : (
          <button
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-cyan-700 px-5 font-medium text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600 dark:bg-cyan-400 dark:text-zinc-950 dark:hover:bg-cyan-300 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
            disabled={!canSubmit}
            type="submit"
          >
            <Send aria-hidden="true" size={18} />
            Send
          </button>
        )}
      </form>
    </main>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  return (
    <article className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-3 text-sm leading-6 whitespace-pre-wrap ${
          isUser
            ? "bg-cyan-700 text-white dark:bg-cyan-400 dark:text-zinc-950"
            : "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
        }`}
      >
        {message.parts.map((part, index) => {
          if (part.type === "text") {
            return <p key={index}>{part.content}</p>;
          }

          if (part.type === "thinking") {
            return (
              <p key={index} className="text-zinc-500 dark:text-zinc-400">
                <LoaderCircle aria-hidden="true" className="mr-2 inline animate-spin" size={14} />
                Thinking...
              </p>
            );
          }

          return null;
        })}
      </div>
    </article>
  );
}
