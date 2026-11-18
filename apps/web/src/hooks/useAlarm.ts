import { useEffect } from "react";

const ALARM_INTERVAL_MS = 1200;

function tone(context: AudioContext) {
  const now = context.currentTime;
  const gain = context.createGain();
  const oscillator = context.createOscillator();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(880, now);
  oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.18);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.25);
  oscillator.addEventListener("ended", () => {
    oscillator.disconnect();
    gain.disconnect();
  });
}

let shared: AudioContext | null = null;
function audio(): AudioContext | null {
  if (!shared && typeof AudioContext !== "undefined") shared = new AudioContext();
  return shared;
}

// Browsers start audio only after a user gesture: arm the context on the first one.
for (const type of ["pointerdown", "keydown"] as const)
  window.addEventListener(
    type,
    () =>
      void audio()
        ?.resume()
        .catch(() => {}),
    { passive: true },
  );

/** Rings softly every 1.2 s while `active` and the page is visible; silent if audio is not allowed yet. */
export function useAlarm(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const ring = () => {
      const context = audio();
      if (context?.state === "running" && document.visibilityState === "visible") tone(context);
    };
    ring();
    const id = window.setInterval(ring, ALARM_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [active]);
}
