import { useEffect } from "react";

const LOCAL_HTTP_WARNING = "[DurableStream] Using HTTP (not HTTPS)";

export function useSuppressLocalDurableStreamWarning() {
  useEffect(() => {
    if (import.meta.env.PROD) {
      return;
    }

    const originalWarn = console.warn;

    console.warn = (...args: Array<unknown>) => {
      if (typeof args[0] === "string" && args[0].includes(LOCAL_HTTP_WARNING)) {
        return;
      }

      originalWarn(...args);
    };

    return () => {
      console.warn = originalWarn;
    };
  }, []);
}
