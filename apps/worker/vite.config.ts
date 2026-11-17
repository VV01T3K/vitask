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
  test: { include: ["test/**/*.test.ts"], testTimeout: 20_000 },
});
