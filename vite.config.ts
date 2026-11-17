import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: [
      "apps/worker/public/**",
      "**/.celld/**",
      "**/.wrangler/**",
      // Generated eval reports.
      "packages/evals/reports/**",
    ],
    sortTailwindcss: true,
    sortImports: true,
    sortPackageJson: true,
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  run: {
    cache: true,
  },
});
