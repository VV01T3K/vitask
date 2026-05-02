import { Link } from "@tanstack/react-router";

import ThemeToggle from "./ThemeToggle";

function Logo() {
  return (
    <Link to="/">
      <div className="font-vitask-mono text-vitask-text-primary text-[18px] font-semibold tracking-[-0.02em] select-none">
        <span className="text-vitask-text-tertiary text-xl font-normal">[</span>
        <span className="text-vitask-accent bg-vitask-accent/15 rounded-sm px-px font-bold">
          vi
        </span>
        <span>task</span>
        <span className="text-vitask-text-tertiary text-xl font-normal">]</span>
      </div>
    </Link>
  );
}

export default function Header() {
  return (
    <header className="border-vitask-border bg-vitask-bg flex items-center justify-between border-b px-6 py-3.5">
      <Logo />
      <ThemeToggle />
    </header>
  );
}
