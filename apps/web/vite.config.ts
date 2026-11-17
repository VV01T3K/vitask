import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

/** The Worker the dev server proxies `/api` and the WebSocket to (`vpr dev` starts it on celld). */
const api = process.env.VITASK_API ?? "http://127.0.0.1:8790";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.VITASK_WEB_PORT ?? 5173),
    strictPort: true,
    proxy: {
      // Transparent: Host and Origin stay the dev server's, so to the Worker the browser is same-origin, as in
      // production, and passkeys and auth callbacks use http://localhost:5173 (BETTER_AUTH_URL in wrangler.jsonc).
      "/api": { target: api, ws: true },
    },
  },
  // The Worker serves this directory as its static assets (apps/worker/wrangler.jsonc).
  build: { outDir: "../worker/public", emptyOutDir: true },
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
