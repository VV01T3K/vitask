import { Link } from "@tanstack/react-router";
import { Sparkle } from "lucide-react";

import ThemeToggle from "./ThemeToggle";

function Logo() {
  return (
    <Link to="/">
      <div className="font-vitask-mono text-vitask-text-primary text-[18px] font-semibold select-none">
        <span className="text-vitask-text-tertiary text-xl">[</span>
        <span className="text-vitask-accent font-bold">vi</span>
        <span>task</span>
        <span className="text-vitask-text-tertiary text-xl">]</span>
      </div>
    </Link>
  );
}

export default function Header() {
  return (
    <header className="border-vitask-border bg-vitask-surface flex items-center justify-between border-b px-6 py-3.5">
      <Logo />
      <div className="flex items-center gap-2.5">
        <Link
          to="/demo/ai"
          className="text-vitask-text-secondary hover:text-vitask-text-primary transition"
        >
          AI
        </Link>
        <ThemeToggle />
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
