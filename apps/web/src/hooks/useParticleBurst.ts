import { useCallback, useState } from "react";

export type Particle = {
  id: number;
  dx: number;
  dy: number;
};

type ParticleBurstOptions = {
  count?: number;
  baseDistance?: number;
  jitterDistance?: number;
  angleJitter?: number;
  durationMs?: number;
};

export function useParticleBurst({
  count = 6,
  baseDistance = 16,
  jitterDistance = 10,
  angleJitter = 0.5,
  durationMs = 700,
}: ParticleBurstOptions = {}) {
  const [particles, setParticles] = useState<Particle[]>([]);

  const burst = useCallback(() => {
    const baseId = Date.now();
    const next: Particle[] = Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + Math.random() * angleJitter;
      const dist = baseDistance + Math.random() * jitterDistance;
      return { id: baseId + i, dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist };
    });
    setParticles(next);
    window.setTimeout(() => setParticles([]), durationMs);
  }, [count, baseDistance, jitterDistance, angleJitter, durationMs]);

  return { particles, burst };
}
