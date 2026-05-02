import { useCallback, useEffect, useRef, useState } from "react";

const ALARM_INTERVAL_MS = 1200;

type UseTimerAlertsResult = {
  playing: boolean;
  activeOwnerId: string | null;
  play: (ownerId: string) => Promise<boolean>;
  stop: (ownerId?: string) => void;
};

function triggerAlarmTone(context: AudioContext) {
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

export function useTimerAlerts(): UseTimerAlertsResult {
  const [playing, setPlaying] = useState(false);
  const [activeOwnerId, setActiveOwnerId] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const loopRef = useRef<number | null>(null);
  const activeOwnerRef = useRef<string | null>(null);

  const ensureContext = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (audioContextRef.current) return audioContextRef.current;
    const AudioContextCtor = window.AudioContext;
    if (!AudioContextCtor) return null;
    audioContextRef.current = new AudioContextCtor();
    return audioContextRef.current;
  }, []);

  const stop = useCallback((ownerId?: string) => {
    if (ownerId && activeOwnerRef.current && ownerId !== activeOwnerRef.current) {
      return;
    }
    if (loopRef.current !== null) {
      window.clearInterval(loopRef.current);
      loopRef.current = null;
    }
    activeOwnerRef.current = null;
    setPlaying(false);
    setActiveOwnerId(null);
  }, []);

  const tryResume = useCallback(async () => {
    const context = ensureContext();
    if (!context) return false;
    try {
      if (context.state !== "running") {
        await context.resume();
      }
      return context.state === "running";
    } catch {
      return false;
    }
  }, [ensureContext]);

  const play = useCallback(
    async (ownerId: string) => {
      const context = ensureContext();
      if (!context) return false;
      const didArm = await tryResume();
      if (!didArm) return false;
      if (activeOwnerRef.current === ownerId && loopRef.current !== null) {
        return true;
      }

      stop();
      activeOwnerRef.current = ownerId;
      setActiveOwnerId(ownerId);
      setPlaying(true);

      triggerAlarmTone(context);
      loopRef.current = window.setInterval(() => {
        if (context.state === "running") {
          triggerAlarmTone(context);
        }
      }, ALARM_INTERVAL_MS);

      return true;
    },
    [ensureContext, stop, tryResume],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const resume = () => {
      void tryResume();
    };

    window.addEventListener("pointerdown", resume);
    window.addEventListener("keydown", resume);
    return () => {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
    };
  }, [tryResume]);

  useEffect(() => {
    return () => {
      stop();
      void audioContextRef.current?.close();
    };
  }, [stop]);

  return {
    playing,
    activeOwnerId,
    play,
    stop,
  };
}
