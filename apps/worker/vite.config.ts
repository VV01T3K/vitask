import { defineConfig } from "vite-plus";

export default defineConfig({
  // migrations/*.sql as text, as the `rules` entry in wrangler.jsonc bundles them for the Worker.
  plugins: [
    {
      name: "sql-as-text",
      transform: (code, id) =>
        id.endsWith(".sql") ? { code: `export default ${JSON.stringify(code)};`, map: null } : null,
    },
  ],
  // These read env vars and touch real databases or deployments, so they always run.
  run: {
    tasks: {
      "deploy:celld": { command: "node scripts/deploy-celld.mjs", cache: false },
      "db:migrate:local": {
        command: "wrangler d1 migrations apply vitask-auth --local",
        cache: false,
      },
      "db:migrate:celld": { command: "celld d1 migrations apply vitask-auth .", cache: false },
      "db:migrate:cloudflare": {
        command: "wrangler d1 migrations apply vitask-auth --remote",
        cache: false,
      },
      "db:schema": { command: "node scripts/auth-schema.mjs", cache: false },
      "test:integration": { command: "node scripts/integration.mjs", cache: false },
    },
  },
  test: { include: ["test/**/*.test.ts"], testTimeout: 20_000 },
});
