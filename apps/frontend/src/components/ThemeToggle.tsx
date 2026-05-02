import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  function toggleTheme() {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }

  return (
    <button
      aria-label="Toggle color theme"
      className="border-vitask-border bg-vitask-surface text-vitask-text-secondary hover:border-vitask-border-bright hover:bg-vitask-elevated hover:text-vitask-text-primary inline-flex size-8 items-center justify-center rounded-md border text-[15px]"
      onClick={toggleTheme}
      title="Toggle color theme"
      type="button"
    >
      <span aria-hidden="true" className="inline-grid place-items-center">
        <Sun className="theme-toggle-sun col-start-1 row-start-1" size={16} strokeWidth={1.9} />
        <Moon className="theme-toggle-moon col-start-1 row-start-1" size={16} strokeWidth={1.9} />
      </span>
    </button>
  );
}
