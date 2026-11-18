import type { ReactNode } from "react";

import { linkHandler } from "../lib/router.ts";
import { ThemeToggle } from "./ThemeToggle.tsx";

export function Logo() {
  return (
    <a aria-label="vitask home" className="rounded-sm" href="/" onClick={linkHandler("/")}>
      <span className="font-vitask-mono text-vitask-text-primary text-[18px] font-semibold tracking-[-0.02em] select-none">
        <span className="text-vitask-text-tertiary text-xl font-normal">[</span>
        <span className="text-vitask-accent bg-vitask-accent/15 rounded-sm px-px font-bold">
          vi
        </span>
        <span>task</span>
        <span className="text-vitask-text-tertiary text-xl font-normal">]</span>
      </span>
    </a>
  );
}

export function Header({ children }: { children?: ReactNode }) {
  return (
    <header className="border-vitask-border bg-vitask-bg flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6 sm:py-3.5">
      <Logo />
      <div className="flex items-center gap-3 sm:gap-4">
        {children}
        <ThemeToggle />
      </div>
    </header>
  );
}
