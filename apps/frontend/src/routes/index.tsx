import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Sparkle } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="vitask-surface font-vitask-body text-vitask-text-primary min-h-full">
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
          A tiny task list with care timers and AI nudges. Capture what you're working on, set
          gentle reminders, and wrap up the session feeling good.
        </p>

        <Link
          to="/dashboard"
          className="bg-vitask-accent/15 border-vitask-accent/40 hover:bg-vitask-accent/25 hover:border-vitask-accent text-vitask-accent inline-flex items-center gap-2 rounded-md border px-5 py-2.5 text-sm font-medium transition-colors"
        >
          Open dashboard
          <ArrowRight aria-hidden="true" size={14} />
        </Link>
      </main>
    </div>
  );
}
