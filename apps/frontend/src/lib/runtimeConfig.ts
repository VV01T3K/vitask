export type AppConfig = {
  backendUrl: string;
  scalarEnabled: boolean;
  scalarUrl: string;
};

declare global {
  interface Window {
    __APP_CONFIG__?: AppConfig;
  }
}

const DEFAULT_BACKEND_URL = "http://localhost:5107";

function readServerConfig(): AppConfig {
  const backendUrl = process.env.PUBLIC_BACKEND_URL ?? DEFAULT_BACKEND_URL;
  return {
    backendUrl,
    scalarEnabled: process.env.SCALAR_ENABLED === "true",
    scalarUrl: process.env.SCALAR_URL ?? `${backendUrl}/scalar`,
  };
}

export function getRuntimeConfig(): AppConfig {
  if (typeof window === "undefined") {
    return readServerConfig();
  }
  return (
    window.__APP_CONFIG__ ?? {
      backendUrl: DEFAULT_BACKEND_URL,
      scalarEnabled: false,
      scalarUrl: `${DEFAULT_BACKEND_URL}/scalar`,
    }
  );
}
