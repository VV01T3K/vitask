#!/usr/bin/env node
// celld 0.6.3 has no secrets: `celld deploy` reads only `vars` from the config (not .dev.vars), and stores them with
// the deployment in the fleet bucket. This script renders a temporary config with the secrets taken from the
// environment, deploys it, and deletes it, so secrets never land in git.
// Usage: GROQ_API_KEY=... COOKIE_SECRET=... vpr deploy:celld -- --bucket s3://... [other celld deploy flags]
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SECRETS = ["GROQ_API_KEY", "COOKIE_SECRET"];
const workerDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const missing = SECRETS.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Set ${missing.join(", ")} in the environment.`);
  process.exit(2);
}
if (process.env.COOKIE_SECRET.startsWith("dev-only") || process.env.COOKIE_SECRET.length < 32) {
  console.error("COOKIE_SECRET must be a random value of at least 32 characters.");
  process.exit(2);
}

const config = JSON.parse(
  readFileSync(join(workerDir, "wrangler.jsonc"), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
    .replace(/,(\s*[}\]])/g, "$1"),
);
delete config.$schema;
for (const name of SECRETS) config.vars[name] = process.env[name];

const rendered = join(workerDir, ".deploy.wrangler.jsonc");
writeFileSync(rendered, JSON.stringify(config, null, 2), { mode: 0o600 });
try {
  const result = spawnSync("celld", ["deploy", rendered, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, CELLD_ESBUILD: join(workerDir, "node_modules/.bin/esbuild") },
  });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(rendered, { force: true });
}
