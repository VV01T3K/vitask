import { useCallback, useEffect } from "react";
import { flushSync } from "react-dom";

type ViewTransition = {
  ready: Promise<void>;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void | Promise<void>) => ViewTransition;
};

const DURATION = 350;
const EASING = "ease-in-out";
const PSEUDO_ELEMENT = "::view-transition-new(root)";

function ensureBaseStyles() {
  if (
    typeof document === "undefined" ||
    document.getElementById("theme-toggle-view-transition-style")
  ) {
    return;
  }

  const style = document.createElement("style");
  style.id = "theme-toggle-view-transition-style";
  style.textContent = `
		::view-transition-old(root),
		::view-transition-new(root) {
			animation: none;
			mix-blend-mode: normal;
		}
	`;

  document.head.append(style);
}

export function useCircleThemeTransition() {
  useEffect(() => {
    ensureBaseStyles();
  }, []);

  return useCallback(async (trigger: HTMLElement | null, commit: () => void) => {
    if (
      typeof window === "undefined" ||
      !trigger ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      commit();
      return;
    }

    const viewTransitionDocument = document as ViewTransitionDocument;

    if (!viewTransitionDocument.startViewTransition) {
      commit();
      return;
    }

    const { top, left, width, height } = trigger.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    const maxRadius = Math.max(
      Math.hypot(x, y),
      Math.hypot(window.innerWidth - x, y),
      Math.hypot(x, window.innerHeight - y),
      Math.hypot(window.innerWidth - x, window.innerHeight - y),
    );

    await viewTransitionDocument.startViewTransition(() => {
      flushSync(() => {
        commit();
      });
    }).ready;

    document.documentElement.animate(
      {
        clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${maxRadius}px at ${x}px ${y}px)`],
      },
      {
        duration: DURATION,
        easing: EASING,
        pseudoElement: PSEUDO_ELEMENT,
      },
    );
  }, []);
}
