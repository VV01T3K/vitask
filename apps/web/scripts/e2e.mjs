#!/usr/bin/env node
// End-to-end run of the built web app against the real Worker on `celld dev`, in headless Chromium, with a real model.
// Usage: vpr test:e2e   (needs celld on PATH or ~/.local/bin and GROQ_API_KEY in apps/worker/.dev.vars or the env)
// Screenshots go to E2E_SCREENSHOTS (default apps/web/test-results/).
import { spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workerDir = resolve(webDir, "../worker");
const shots = resolve(process.env.E2E_SCREENSHOTS ?? join(webDir, "test-results"));
const celld =
  process.env.CELLD ??
  (existsSync(join(homedir(), ".local/bin/celld")) ? join(homedir(), ".local/bin/celld") : "celld");
const port = 20_000 + Math.floor(Math.random() * 20_000);
const base = `http://127.0.0.1:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

// 1. Build the app into the Worker's asset directory.
const build = spawnSync(join(webDir, "node_modules/.bin/vp"), ["build"], {
  cwd: webDir,
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status ?? 1);

// 2. A throwaway celld project around the real Worker, so `--clean` touches only this run's state.
const project = mkdtempSync(join(tmpdir(), "vitask-e2e-"));
const config = JSON.parse(
  readFileSync(join(workerDir, "wrangler.jsonc"), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
    .replace(/,(\s*[}\]])/g, "$1"),
);
delete config.$schema;
symlinkSync(join(workerDir, "src"), join(project, "src"));
cpSync(join(workerDir, "public"), join(project, "public"), { recursive: true });
writeFileSync(join(project, "wrangler.jsonc"), JSON.stringify(config, null, 2));
if (existsSync(join(workerDir, ".dev.vars"))) {
  symlinkSync(join(workerDir, ".dev.vars"), join(project, ".dev.vars")); // never copy the key
} else if (process.env.GROQ_API_KEY) {
  writeFileSync(join(project, ".dev.vars"), `GROQ_API_KEY=${process.env.GROQ_API_KEY}\n`, {
    mode: 0o600,
  });
} else {
  console.error("No GROQ_API_KEY: put it in apps/worker/.dev.vars or the environment.");
  process.exit(2);
}

const child = spawn(celld, ["dev", project, "--port", String(port), "--no-watch", "--clean"], {
  cwd: project,
  detached: true, // its own process group, so one kill reaches every child
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    CELLD_ESBUILD: join(workerDir, "node_modules/.bin/esbuild"),
    NO_COLOR: "1",
  },
});
let log = "";
child.stdout.on("data", (data) => (log += data));
child.stderr.on("data", (data) => (log += data));
const killCelld = () => {
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {}
};

async function step(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true });
    console.log(`PASS ${name} (${Date.now() - started} ms)${detail ? ` - ${detail}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false });
    console.log(`FAIL ${name}: ${error?.message ?? error}`);
    throw error;
  }
}

let browser;
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch {}
    if (i > 120) throw new Error(`celld did not start:\n${log}`);
    await sleep(250);
  }
  mkdirSync(shots, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  await step("landing links to the dashboard", async () => {
    await page.goto(base);
    await page.getByRole("link", { name: "Open dashboard" }).click();
    await page.waitForURL(`${base}/dashboard`);
    await page.getByText("live", { exact: true }).waitFor({ timeout: 15_000 });
  });

  await step("add a task and complete it", async () => {
    const input = page.getByRole("textbox", { name: "Add task" });
    await input.fill("Write the quarterly report");
    await input.press("Enter");
    await page.getByRole("button", { name: "Mark Write the quarterly report complete" }).click();
    await page
      .getByRole("button", { name: "Mark Write the quarterly report not done" })
      .waitFor({ timeout: 10_000 });
    const reloaded = await (await page.request.get(`${base}/api/snapshot`)).json();
    const saved = reloaded.tasks.find((t) => t.title === "Write the quarterly report");
    if (saved?.status !== "done") throw new Error(`server has ${JSON.stringify(saved)}`);
  });

  await step("start a session", async () => {
    await page.getByRole("button", { name: "Start session" }).click();
    await page.getByText("live session").waitFor({ timeout: 10_000 });
    await page.getByRole("button", { name: /Wrap up session/ }).waitFor();
  });

  const title = "Stretch for five minutes";
  let card;
  await step("the coach proposes a change and waits for approval", async () => {
    const composer = page.getByRole("textbox", { name: "Message the coach" });
    await composer.fill(`Please add a task titled "${title}" with an estimate of 5 minutes.`);
    await composer.press("Enter");
    card = page.locator('[data-approval-status="pending"]').first();
    await card.waitFor({ timeout: 90_000 });
    const summary = (await card.locator("p").first().innerText()).trim();
    if (!summary.toLowerCase().includes("stretch"))
      throw new Error(`unexpected summary ${summary}`);
    await page.getByText("needs your ok").first().waitFor();
    if (await page.getByRole("button", { name: `Mark ${title} complete` }).count())
      throw new Error("the task exists before approval");
    await sleep(600); // let the card's entrance settle
    await card.screenshot({ path: join(shots, "approval-card.png") });
    await page.screenshot({ path: join(shots, "desktop-dark-pending.png") });
    return summary;
  });

  await step("approving applies the change", async () => {
    await card.getByRole("button", { name: "Approve" }).click();
    await page.locator('[data-approval-status="applied"]').first().waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: `Mark ${title} complete` }).waitFor({ timeout: 10_000 });
    // The coach finishes its answer.
    await page.locator("[data-live]").waitFor({ state: "detached", timeout: 90_000 });
    await page
      .locator('[data-approval-status="applied"]')
      .first()
      .screenshot({ path: join(shots, "approval-card-applied.png") });
  });

  await step("desktop dark screenshot", async () => {
    await page.screenshot({ path: join(shots, "desktop-dark.png"), fullPage: true });
  });

  await step("the activity drawer shows the turn", async () => {
    await page.getByRole("button", { name: "Agent activity" }).click();
    const dialog = page.getByRole("dialog", { name: "Agent activity" });
    await dialog.locator('tr[data-trigger="chat"]').first().waitFor({ timeout: 10_000 });
    const rows = await dialog.locator('tr[data-trigger="chat"]').count();
    await sleep(400); // the slide-in
    await page.screenshot({ path: join(shots, "activity-drawer.png") });
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    return `${rows} chat turns`;
  });

  await step("desktop light screenshot", async () => {
    await page.getByRole("button", { name: "Switch to light theme" }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
    await sleep(500); // the circle transition
    await page.screenshot({ path: join(shots, "desktop-light.png"), fullPage: true });
  });

  await step("phone width screenshot", async () => {
    const phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      colorScheme: "dark",
      storageState: await context.storageState(),
    });
    const mobile = await phone.newPage();
    await mobile.goto(`${base}/dashboard`);
    await mobile.getByText("live", { exact: true }).waitFor({ timeout: 15_000 });
    const overflow = await mobile.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    await mobile.screenshot({ path: join(shots, "phone.png"), fullPage: true });
    await phone.close();
    if (overflow > 0) throw new Error(`horizontal overflow of ${overflow}px at phone width`);
  });

  await step("no errors in the browser console", async () => {
    if (consoleErrors.length > 0) throw new Error(consoleErrors.join("\n"));
  });
} catch (error) {
  if (!results.some((r) => !r.ok)) {
    results.push({ name: "setup", ok: false });
    console.log(`FAIL setup: ${error?.stack ?? error}`);
  }
} finally {
  await browser?.close();
  killCelld();
  await sleep(500);
  rmSync(project, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} steps passed; screenshots in ${shots}`,
);
process.exit(failed.length === 0 ? 0 : 1);
