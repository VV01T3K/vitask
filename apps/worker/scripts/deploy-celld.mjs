#!/usr/bin/env node
// celld 0.6.3 has no secrets: `celld deploy` reads only `vars` from the config (not .dev.vars), and stores them with
// the deployment in the fleet bucket. This script renders a temporary config with the secrets taken from the
// environment, deploys it, and deletes it, so secrets never land in git.
// Usage: GROQ_API_KEY=... COOKIE_SECRET=... BETTER_AUTH_SECRET=... BETTER_AUTH_URL=https://... \
//          vpr --filter @vitask/worker deploy:celld --bucket s3://... [other celld deploy flags]
// Then apply D1 migrations: CELLD_BUCKET=s3://... vpr --filter @vitask/worker db:migrate:celld
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SECRETS = ["GROQ_API_KEY", "COOKIE_SECRET", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"];
const workerDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const missing = SECRETS.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Set ${missing.join(", ")} in the environment.`);
  process.exit(2);
}
for (const name of ["COOKIE_SECRET", "BETTER_AUTH_SECRET"]) {
  if (process.env[name].startsWith("dev-only") || process.env[name].length < 32) {
    console.error(
      `${name} must be a random value of at least 32 characters (openssl rand -base64 32).`,
    );
    process.exit(2);
  }
}
if (!process.env.BETTER_AUTH_URL.startsWith("https://")) {
  console.error(
    "BETTER_AUTH_URL must be the app's public https:// origin (passkeys and cookies depend on it).",
  );
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
