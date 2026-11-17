import { useSyncExternalStore, type MouseEvent } from "react";

/** Two pages do not need a router library: the path, kept in sync with history. */
const listeners = new Set<() => void>();
window.addEventListener("popstate", () => listeners.forEach((listener) => listener()));

export function usePath(): string {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => location.pathname,
  );
}

export function navigate(path: string): void {
  if (location.pathname === path) return;
  history.pushState(null, "", path);
  listeners.forEach((listener) => listener());
  window.scrollTo(0, 0);
}

/** onClick for an `<a href>` that stays in the app; modified clicks keep their browser meaning. */
export function linkHandler(path: string) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
      return;
    event.preventDefault();
    navigate(path);
  };
}
