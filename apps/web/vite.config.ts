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
      "/api": {
        target: api,
        ws: true,
        changeOrigin: true,
        // The Worker refuses foreign origins; through the proxy the browser's origin is the dev server's.
        configure: (proxy) => {
          proxy.on("proxyReq", (request) => request.setHeader("origin", api));
          proxy.on("proxyReqWs", (request) => request.setHeader("origin", api));
        },
      },
    },
  },
  // The Worker serves this directory as its static assets (apps/worker/wrangler.jsonc).
  build: { outDir: "../worker/public", emptyOutDir: true },
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
