import { useTheme } from "next-themes";

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  function toggleTheme() {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }

  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle color theme"
      title="Toggle color theme"
      className="border-vitask-border bg-vitask-surface text-vitask-text-secondary hover:border-vitask-border-bright hover:bg-vitask-elevated hover:text-vitask-text-primary inline-flex size-8 cursor-default items-center justify-center rounded-md border text-[15px] transition"
      type="button"
    >
      <span aria-hidden="true">☾</span>
    </button>
  );
}
