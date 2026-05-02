import { useEffect, useState } from "react";

export function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function relTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  return `${Math.floor(diff / 3600)} hr ago`;
}

export type TimerIcon =
  | "droplet"
  | "eye"
  | "posture"
  | "stretch"
  | "walk"
  | "breath"
  | "snack"
  | "default";

export function pickIcon(title: string): TimerIcon {
  const t = title.toLowerCase();
  if (t.includes("hydrat") || t.includes("water")) return "droplet";
  if (t.includes("eye") || t.includes("20-20")) return "eye";
  if (t.includes("posture") || t.includes("back")) return "posture";
  if (t.includes("stretch")) return "stretch";
  if (t.includes("walk")) return "walk";
  if (t.includes("breath")) return "breath";
  if (t.includes("snack") || t.includes("food")) return "snack";
  return "default";
}

const ACCENT_HYDRATION = "#6c8fff";
const ACCENT_EYE = "#2dd4bf";
const ACCENT_POSTURE = "#fbbf24";
const ACCENT_STRETCH = "#4ade80";
const ACCENT_WALK = "#f87171";

export function accentFor(title: string): string {
  const k = title.toLowerCase();
  if (k.includes("hydrat") || k.includes("water")) return ACCENT_HYDRATION;
  if (k.includes("eye") || k.includes("20-20")) return ACCENT_EYE;
  if (k.includes("posture")) return ACCENT_POSTURE;
  if (k.includes("stretch")) return ACCENT_STRETCH;
  if (k.includes("walk")) return ACCENT_WALK;
  return "var(--color-vitask-accent)";
}

export function useTypewriter(
  text: string,
  speed = 5,
  active = true,
): { text: string; done: boolean } {
  const [out, setOut] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!active || !text) {
      setOut("");
      setDone(false);
      return;
    }
    setOut("");
    setDone(false);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setOut(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(id);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(id);
  }, [text, active, speed]);

  return { text: out, done };
}
