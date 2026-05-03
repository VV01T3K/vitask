declare global {
  interface ImportMeta {
    readonly env?: { readonly VITE_BACKEND_URL?: string };
  }
}

const DEFAULT_BASE = "http://localhost:5107";

function resolveBase(): string {
  if (typeof window === "undefined") {
    return process.env.BACKEND_URL ?? DEFAULT_BASE;
  }
  return import.meta.env?.VITE_BACKEND_URL ?? DEFAULT_BASE;
}

export const API_BASE_URL: string = resolveBase();
