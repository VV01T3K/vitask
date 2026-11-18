import { ArrowRight, Sparkle } from "lucide-react";

import { linkHandler } from "../lib/router.ts";
import { Header } from "./Header.tsx";

export function Landing() {
  return (
    <div className="flex min-h-full flex-col">
      <Header />
      <div className="vitask-surface font-vitask-body text-vitask-text-primary flex-1">
        <main className="mx-auto flex w-full max-w-[880px] flex-col items-center gap-8 px-6 py-24 text-center">
          <span className="font-vitask-mono text-vitask-text-tertiary inline-flex items-center gap-2 text-[11px] tracking-[0.12em] uppercase">
            <Sparkle aria-hidden="true" className="text-vitask-teal" size={12} />
            focus, with vibes
          </span>

          <h1 className="text-vitask-text-primary text-5xl font-semibold tracking-tight sm:text-6xl">
            <span className="text-vitask-accent bg-vitask-accent/15 rounded-sm px-1">vi</span>task
          </h1>

          <p className="font-vitask-mono text-vitask-text-tertiary text-[13px] tracking-[0.08em]">
            <span className="text-vitask-accent">vita</span>
            <span className="text-vitask-text-secondary"> + </span>
            <span>task</span>
          </p>

          <p className="text-vitask-text-secondary max-w-[560px] text-base leading-relaxed sm:text-lg">
            A small task list with care timers and an AI coach. It breaks work down, plans focus
            blocks and nudges you to take breaks, and it asks before it changes anything.
          </p>

          <a
            className="bg-vitask-accent/15 border-vitask-accent/40 hover:bg-vitask-accent/25 hover:border-vitask-accent text-vitask-accent inline-flex items-center gap-2 rounded-md border px-5 py-2.5 text-sm font-medium transition-colors"
            href="/dashboard"
            onClick={linkHandler("/dashboard")}
          >
            Open dashboard
            <ArrowRight aria-hidden="true" size={14} />
          </a>
        </main>
      </div>
    </div>
  );
}
