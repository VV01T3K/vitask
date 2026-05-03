const DEFAULT_BASE = "http://localhost:5107";

function resolveBase(): string {
  if (typeof window === "undefined") {
    return process.env.BACKEND_URL ?? process.env.PUBLIC_BACKEND_URL ?? DEFAULT_BASE;
  }
  const config = (window as Window & { __APP_CONFIG__?: { backendUrl?: string } })
    .__APP_CONFIG__;
  return config?.backendUrl ?? DEFAULT_BASE;
}

export const API_BASE_URL: string = resolveBase();
