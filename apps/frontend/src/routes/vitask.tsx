import { createFileRoute } from "@tanstack/react-router";
import { Droplet, Eye, Plus, RotateCcw, Sparkle, X } from "lucide-react";

export const Route = createFileRoute("/vitask")({
  head: () => ({
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap",
      },
    ],
  }),
  component: VitaskRoute,
});

const ACTIVE_TASKS = [
  { id: "t1", title: "Refactor auth middleware to use new token shape" },
  { id: "t2", title: "Write integration tests for /api/wrap-up" },
];

const SHIPPED_TASKS = [
  {
    id: "t0",
    title: "Fix navbar CSS alignment",
    shippedAgo: "14 min ago",
    hype: "Done. Crushed. Demolished. Somewhere a project manager just felt a tingle of joy and didn't know why.",
  },
];

function VitaskRoute() {
  return (
    <div className="vitask-surface font-vitask-body text-vitask-text-primary min-h-screen">
      <VitaskHeader />
      <main className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-4 p-6 lg:grid-cols-[3fr_2fr]">
        <TasksPanel />
        <TimersPanel />
      </main>
    </div>
  );
}

function VitaskHeader() {
  return (
    <header className="border-vitask-border bg-vitask-bg flex items-center justify-between border-b px-6 py-3.5">
      <Logo />
      <div className="flex items-center gap-2.5">
        <button
          aria-label="Theme"
          className="border-vitask-border bg-vitask-surface text-vitask-text-secondary hover:border-vitask-border-bright hover:bg-vitask-elevated hover:text-vitask-text-primary inline-flex size-8 cursor-default items-center justify-center rounded-md border text-[15px] transition"
          type="button"
        >
          <span aria-hidden="true">☾</span>
        </button>
        <button
          className="border-vitask-border text-vitask-text-secondary hover:border-vitask-border-bright hover:bg-vitask-surface hover:text-vitask-text-primary inline-flex cursor-default items-center gap-2 rounded border bg-transparent px-3.5 py-1.5 text-[13px] font-medium transition"
          type="button"
        >
          Wrap up session <Sparkle aria-hidden="true" className="text-vitask-teal" size={12} />
        </button>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <div className="font-vitask-mono text-vitask-text-primary text-[18px] font-semibold tracking-[-0.02em] select-none">
      <span className="text-vitask-text-tertiary font-normal">[</span>
      <span className="text-vitask-accent bg-vitask-accent/15 rounded-[3px] px-[1px] font-bold">
        vi
      </span>
      <span>task</span>
      <span className="text-vitask-text-tertiary font-normal">]</span>
    </div>
  );
}

function TasksPanel() {
  return (
    <section className="flex min-h-0 flex-col gap-3">
      <div className="text-vitask-text-tertiary mb-1 flex items-center justify-between text-[11px] font-medium tracking-[0.08em] uppercase">
        <span>in flight</span>
      </div>

      <div className="bg-vitask-elevated border-vitask-border focus-within:border-vitask-accent flex h-11 items-center gap-2.5 rounded-md border px-3.5 transition-colors">
        <span className="font-vitask-mono text-vitask-text-tertiary text-base select-none">+</span>
        <input
          className="placeholder:text-vitask-text-tertiary text-vitask-text-primary flex-1 border-none bg-transparent text-sm outline-none"
          placeholder="What are you working on..."
          type="text"
        />
      </div>

      <ul className="flex flex-col gap-0.5">
        {ACTIVE_TASKS.map((task) => (
          <TaskRow key={task.id} title={task.title} />
        ))}

        <li>
          <div className="mt-4 mb-1.5 flex items-center gap-3 px-3">
            <div className="bg-vitask-border h-px flex-1" />
            <span className="text-vitask-text-tertiary text-[10px] tracking-[0.12em] uppercase">
              shipped
            </span>
            <div className="bg-vitask-border h-px flex-1" />
          </div>
        </li>

        {SHIPPED_TASKS.map((task) => (
          <ShippedTaskRow key={task.id} {...task} />
        ))}
      </ul>
    </section>
  );
}

function TaskRow({ title }: { title: string }) {
  return (
    <li className="group hover:bg-vitask-elevated relative flex h-11 items-center gap-3 rounded px-3 transition-colors">
      <button
        aria-label="mark complete"
        className="border-vitask-text-tertiary group-hover:border-vitask-text-secondary relative flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] bg-transparent transition-colors"
        type="button"
      >
        <span className="bg-vitask-text-tertiary block size-2 rounded-full opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
      <span className="text-vitask-text-primary flex-1 truncate text-sm">{title}</span>
      <button
        aria-label="delete"
        className="text-vitask-text-secondary hover:text-vitask-coral hover:bg-vitask-coral/10 hover:border-vitask-coral/30 group-hover:text-vitask-text-primary inline-flex h-7 w-7 cursor-default items-center justify-center rounded border border-transparent text-lg leading-none opacity-55 transition group-hover:opacity-100"
        type="button"
      >
        <X aria-hidden="true" size={16} />
      </button>
    </li>
  );
}

function ShippedTaskRow({
  title,
  shippedAgo,
  hype,
}: {
  title: string;
  shippedAgo: string;
  hype: string;
}) {
  return (
    <li className="group relative flex h-11 items-center gap-3 rounded px-3 opacity-60 transition-opacity hover:opacity-100">
      <button
        aria-label="mark incomplete"
        className="border-vitask-green hover:border-vitask-coral relative flex size-[18px] shrink-0 cursor-default items-center justify-center rounded-full border-[1.5px] bg-transparent transition-colors [&:hover_.dot]:hidden [&:hover_.revert]:flex"
        type="button"
      >
        <span className="dot bg-vitask-green ring-vitask-green/25 absolute inset-[3px] rounded-full ring-2" />
        <RotateCcw
          aria-hidden="true"
          className="revert text-vitask-coral hidden"
          size={10}
          strokeWidth={2.5}
        />
      </button>

      <span className="text-vitask-text-secondary flex-1 truncate text-[13px] line-through">
        {title}
      </span>

      <span className="text-vitask-text-tertiary shrink-0 text-xs">{shippedAgo}</span>

      <span
        aria-label="hype quote"
        className="font-vitask-mono text-vitask-text-tertiary hover:text-vitask-teal relative cursor-help text-xs opacity-0 transition group-hover:opacity-100"
        title={hype}
      >
        "
        <span className="bg-vitask-elevated border-vitask-border-bright text-vitask-teal pointer-events-none absolute right-0 bottom-[calc(100%+6px)] z-10 hidden w-60 rounded border p-2.5 text-xs leading-relaxed font-normal whitespace-normal italic shadow-[0_20px_60px_rgba(0,0,0,0.5)] group-hover:hover:block">
          "{hype}"
        </span>
      </span>

      <button
        aria-label="delete"
        className="text-vitask-text-secondary hover:text-vitask-coral hover:bg-vitask-coral/10 hover:border-vitask-coral/30 inline-flex h-7 w-7 cursor-default items-center justify-center rounded border border-transparent leading-none opacity-50 transition group-hover:opacity-100"
        type="button"
      >
        <X aria-hidden="true" size={16} />
      </button>
    </li>
  );
}

function TimersPanel() {
  return (
    <section className="flex min-h-0 flex-col gap-3">
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="text-vitask-text-tertiary text-[11px] font-medium tracking-[0.08em] uppercase">
          timers
        </span>
        <button
          className="border-vitask-border text-vitask-text-tertiary cursor-default rounded-full border bg-transparent px-2.5 py-[3px] text-[11px] tracking-[0.04em]"
          type="button"
        >
          auto-snooze: off
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <RunningTimerCard
          accent="var(--color-vitask-accent)"
          countdown="22:13"
          description="Drink some water"
          icon={<Droplet aria-hidden="true" size={16} />}
          isDefault
          progressPct={63}
          title="Hydration"
        />
        <FiringTimerCard
          aiMessage="Look 20 feet away for 20 seconds. You've shipped solid work; eyes deserve the rest."
          description="Look 20 feet away for 20 seconds"
          icon={<Eye aria-hidden="true" size={16} />}
          isDefault
          title="Eye Rest (20-20-20)"
        />
        <AddTimerCard />
      </div>
    </section>
  );
}

type RunningTimerProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  countdown: string;
  progressPct: number;
  accent: string;
  isDefault?: boolean;
};

function RunningTimerCard({
  icon,
  title,
  description,
  countdown,
  progressPct,
  accent,
  isDefault,
}: RunningTimerProps) {
  return (
    <article className="bg-vitask-surface border-vitask-border hover:border-vitask-border-bright relative rounded-md border px-4 py-3 transition-colors">
      <div className="mb-1.5 flex items-center gap-2.5">
        <span className="text-vitask-text-secondary leading-none">{icon}</span>
        <span className="text-vitask-text-primary inline-flex flex-1 items-center gap-1.5 text-[13px] font-medium">
          {title}
          {isDefault ? (
            <span
              className="text-vitask-text-tertiary text-[10px] opacity-70"
              title="default — can edit, can't delete"
            >
              🔒
            </span>
          ) : null}
        </span>
        <span className="font-vitask-mono text-vitask-text-secondary text-lg font-semibold tracking-[-0.01em] tabular-nums">
          {countdown}
        </span>
      </div>
      <p className="text-vitask-text-secondary mb-2.5 truncate text-xs">{description}</p>
      <div className="bg-vitask-border relative h-1 overflow-hidden rounded-sm">
        <div
          className="h-full rounded-sm transition-[width] duration-500 ease-linear"
          style={{ width: `${progressPct}%`, backgroundColor: accent }}
        />
        <span className="font-vitask-mono text-vitask-text-tertiary absolute -top-4 right-0 text-[10px]">
          {progressPct}%
        </span>
      </div>
    </article>
  );
}

type FiringTimerProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  aiMessage: string;
  isDefault?: boolean;
};

function FiringTimerCard({ icon, title, isDefault, aiMessage }: FiringTimerProps) {
  return (
    <article className="bg-vitask-surface border-vitask-amber animate-vitask-pulse-border relative rounded-md border px-4 py-3 shadow-[0_0_12px_rgba(252,196,69,0.18)]">
      <div className="mb-1.5 flex items-center gap-2.5">
        <span className="text-vitask-text-secondary leading-none">{icon}</span>
        <span className="text-vitask-text-primary inline-flex flex-1 items-center gap-1.5 text-[13px] font-medium">
          {title}
          {isDefault ? (
            <span
              className="text-vitask-text-tertiary text-[10px] opacity-70"
              title="default — can edit, can't delete"
            >
              🔒
            </span>
          ) : null}
        </span>
        <span className="font-vitask-mono text-vitask-amber text-lg font-semibold tracking-[-0.01em] tabular-nums">
          !! 00:00
        </span>
      </div>

      <div className="bg-vitask-border my-2.5 h-px" />

      <div className="text-vitask-teal flex items-start gap-2 py-0.5 text-[13px] leading-relaxed italic">
        <span className="font-vitask-mono border-vitask-teal/40 bg-vitask-teal/15 text-vitask-teal mt-px inline-flex shrink-0 items-center gap-[3px] rounded-[3px] border px-[5px] py-[1px] text-[11px] leading-tight tracking-[0.06em] not-italic">
          <span aria-hidden="true" className="text-[9px]">
            ✦
          </span>
          AI
        </span>
        <span className="min-w-0 flex-1">
          {aiMessage}
          <span aria-hidden="true" className="animate-vitask-blink ml-0.5 inline-block">
            ▍
          </span>
        </span>
      </div>

      <div className="mt-2.5 flex gap-2">
        <button
          className="border-vitask-green/45 text-vitask-green hover:border-vitask-green hover:bg-vitask-green/10 flex-1 cursor-default rounded border bg-transparent px-3 py-1.5 text-xs font-medium transition"
          type="button"
        >
          ✓ Done
        </button>
        <button
          className="bg-vitask-elevated border-vitask-border text-vitask-text-primary hover:border-vitask-border-bright flex-1 cursor-default rounded border px-3 py-1.5 text-xs font-medium transition"
          type="button"
        >
          +5 min
        </button>
      </div>
    </article>
  );
}

function AddTimerCard() {
  return (
    <button
      className="border-vitask-border text-vitask-text-tertiary hover:border-vitask-border-bright hover:text-vitask-accent hover:bg-vitask-accent/5 flex cursor-default flex-col items-center justify-center gap-1.5 rounded-md border border-dashed bg-transparent px-3 py-6 transition hover:border-solid"
      type="button"
    >
      <Plus aria-hidden="true" className="font-vitask-mono" size={22} strokeWidth={1.5} />
      <span className="text-[11px] tracking-[0.08em] uppercase">add timer</span>
    </button>
  );
}
