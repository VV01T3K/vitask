import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
const KEY = "vitask-theme";

const listeners = new Set<() => void>();

function current(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** The theme on `<html data-theme>` (set before first paint by index.html), remembered in localStorage. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, current);
  const setTheme = useCallback((next: Theme) => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // private mode: the choice lasts for this page only
    }
    for (const listener of listeners) listener();
  }, []);
  return [theme, setTheme];
}
