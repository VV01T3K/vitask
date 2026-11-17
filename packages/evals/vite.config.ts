import { defineConfig } from "vite-plus";

// Real evals call a model each time, so their runs are never replayed from the task cache.
export default defineConfig({
  run: {
    tasks: {
      eval: { command: "node src/cli.ts", cache: false },
      "eval:faux": { command: "node src/cli.ts --faux", cache: false },
      "eval:matrix": { command: "node src/cli.ts --matrix", cache: false },
    },
  },
  test: { include: ["test/**/*.test.ts"], testTimeout: 60_000 },
});
