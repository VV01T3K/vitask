#!/usr/bin/env node
// End-to-end check of the Worker on `celld dev`, over real HTTP and WebSockets, with a real model.
// Usage: vpr test:integration   (needs celld on PATH or ~/.local/bin, and GROQ_API_KEY in apps/worker/.dev.vars or the env)
import { spawn } from "node:child_process";
import {
  appendFileSync,
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

const workerDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const celld =
  process.env.CELLD ??
  (existsSync(join(homedir(), ".local/bin/celld")) ? join(homedir(), ".local/bin/celld") : "celld");
const port = 20_000 + Math.floor(Math.random() * 20_000);
const base = `http://127.0.0.1:${port}`;
const origin = base;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
let child;

// ------------------------------------------------------------------------------------------------------------
// A throwaway project: the real wrangler.jsonc with absolute paths and short test intervals, so `--clean` wipes
// only this run's state.
const project = mkdtempSync(join(tmpdir(), "vitask-it-"));
const config = JSON.parse(
  readFileSync(join(workerDir, "wrangler.jsonc"), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
    .replace(/,(\s*[}\]])/g, "$1"), // JSONC trailing commas
);
delete config.$schema;
// celld wants `main` inside the project: link the sources in (esbuild resolves packages from their real path) and
// copy the asset directory (the web build, if there is one), since celld refuses symlinked assets.
symlinkSync(join(workerDir, "src"), join(project, "src"));
if (existsSync(join(workerDir, "public")))
  cpSync(join(workerDir, "public"), join(project, "public"), { recursive: true });
else mkdirSync(join(project, "public"));
Object.assign(config.vars, { MIN_TIMER_INTERVAL_SECONDS: "2", APPROVAL_TTL_SECONDS: "180" });
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

async function startCelld(clean) {
  const args = [
    "dev",
    project,
    "--port",
    String(port),
    "--no-watch",
    ...(clean ? ["--clean"] : []),
  ];
  child = spawn(celld, args, {
    cwd: project,
    detached: true, // its own process group, so a kill reaches every child
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      CELLD_ESBUILD: join(workerDir, "node_modules/.bin/esbuild"),
      NO_COLOR: "1",
    },
  });
  let log = "";
  const record = (data) => {
    log += data;
    // CELLD_LOG=<file> keeps celld's output (with --logs) for debugging a failed run.
    if (process.env.CELLD_LOG) appendFileSync(process.env.CELLD_LOG, data);
  };
  child.stdout.on("data", record);
  child.stderr.on("data", record);
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`celld did not start:\n${log}`);
}

function killCelld() {
  if (!child || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {}
}

class Client {
  cookie = "";
  async request(method, path, body, headers = {}) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        Origin: origin,
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const set = response.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }
  socket() {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws?protocol=1`, {
      headers: { Cookie: this.cookie, Origin: origin },
    });
    const messages = [];
    const waiters = [];
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      messages.push(message);
      // A copy: resolving a waiter removes it from the list.
      for (const waiter of waiters.slice()) if (waiter.match(message)) waiter.resolve(message);
    };
    const next = (match, timeoutMs = 30_000) => {
      const found = messages.find(match);
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const waiter = {
          match,
          resolve: (m) => (
            clearTimeout(timer), waiters.splice(waiters.indexOf(waiter), 1), resolve(m)
          ),
        };
        const timer = setTimeout(
          () => reject(new Error("timed out waiting for a WebSocket message")),
          timeoutMs,
        );
        waiters.push(waiter);
      });
    };
    return {
      ws,
      messages,
      next,
      opened: new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j))),
    };
  }
}

async function check(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true });
    console.log(`PASS ${name} (${Date.now() - started} ms)${detail ? ` - ${detail}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false });
    console.log(`FAIL ${name}: ${error?.stack ?? error}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  await startCelld(true);
  const alice = new Client();
  const bob = new Client();

  await check("two cookies get isolated workspaces", async () => {
    await alice.request("GET", "/api/snapshot");
    await bob.request("GET", "/api/snapshot");
    assert(
      alice.cookie && bob.cookie && alice.cookie !== bob.cookie,
      "expected two different cookies",
    );
    const created = await alice.request("POST", "/api/tasks", { title: "Alice only" });
    assert(created.status === 201, `create failed: ${JSON.stringify(created)}`);
    const a = await alice.request("GET", "/api/snapshot");
    const b = await bob.request("GET", "/api/snapshot");
    assert(
      a.body.tasks.some((t) => t.title === "Alice only"),
      "alice should see her task",
    );
    assert(!b.body.tasks.some((t) => t.title === "Alice only"), "bob must not see alice's task");
  });

  await check("foreign origins and bad input are refused", async () => {
    const foreign = await alice.request(
      "POST",
      "/api/tasks",
      { title: "x" },
      { Origin: "https://evil.example" },
    );
    assert(
      foreign.status === 403 && foreign.body.error.code === "forbidden_origin",
      JSON.stringify(foreign),
    );
    const invalid = await alice.request("POST", "/api/tasks", { title: "", hack: true });
    assert(
      invalid.status === 400 && invalid.body.error.code === "bad_request",
      JSON.stringify(invalid),
    );
  });

  const socket = alice.socket();
  await check("a task added over HTTP shows up on the WebSocket", async () => {
    await socket.opened;
    const hello = await socket.next((m) => m.type === "hello");
    assert(
      hello.snapshot.tasks.some((t) => t.title === "Alice only"),
      "hello carries the snapshot",
    );
    await alice.request("POST", "/api/tasks", { title: "Pushed live" });
    await socket.next((m) => m.type === "task.upserted" && m.task.title === "Pushed live", 10_000);
  });

  await check("a real coach turn proposes a change; approving it applies it", async () => {
    const chat = await alice.request("POST", "/api/chat", {
      text: 'Please add a task titled "Integration check" with an estimate of 15 minutes.',
      requestId: `it-${Date.now()}`,
    });
    assert(chat.status === 202, `chat refused: ${JSON.stringify(chat)}`);
    const proposed = await socket
      .next((m) => m.type === "approval.upserted" && m.approval.status === "pending", 90_000)
      .catch(async (error) => {
        const { coach, approvals } = (await alice.request("GET", "/api/snapshot")).body;
        throw new Error(`${error.message}; coach ${JSON.stringify({ coach, approvals })}`);
      });
    assert(proposed.approval.tool === "add_task", `unexpected tool ${proposed.approval.tool}`);
    const before = await alice.request("GET", "/api/snapshot");
    assert(
      !before.body.tasks.some((t) => /integration check/i.test(t.title)),
      "nothing may change before approval",
    );
    // Decide over the socket, as the UI does.
    socket.ws.send(
      JSON.stringify({
        type: "approval.decide",
        requestId: "it-decide-1",
        approvalId: proposed.approval.id,
        decision: "approve",
      }),
    );
    const ack = await socket.next((m) => m.requestId === "it-decide-1", 10_000);
    assert(ack.type === "ack", `decision refused: ${JSON.stringify(ack)}`);
    await socket.next(
      (m) => m.type === "task.upserted" && /integration check/i.test(m.task.title),
      30_000,
    );
    await socket.next(
      (m) => m.type === "approval.upserted" && m.approval.status === "applied",
      30_000,
    );
    await socket.next((m) => m.type === "coach.live" && !m.live.busy, 90_000);
    const streamed = socket.messages.filter(
      (m) => m.type === "coach.live" && m.live.partialText,
    ).length;
    const turns = (await alice.request("GET", "/api/turns")).body.turns.filter(
      (t) => t.trigger === "chat",
    );
    assert(turns.length >= 2, `expected at least two logged chat turns, got ${turns.length}`);
    return `summary ${JSON.stringify(proposed.approval.summary)}, ${turns.length} turns, ${turns.reduce((s, t) => s + t.inputTokens + t.outputTokens, 0)} tokens, ${streamed} streamed partials`;
  });
  socket.ws.close();

  let fireAt;
  await check("a care-timer nudge fires with no socket connected", async () => {
    const snap = await bob.request("GET", "/api/snapshot");
    for (const timer of snap.body.timers)
      await bob.request("PATCH", `/api/timers/${timer.id}`, { enabled: false });
    const timer = await bob.request("POST", "/api/timers", {
      label: "Stretch",
      intervalSeconds: 3,
    });
    assert(timer.status === 201, JSON.stringify(timer));
    await bob.request("POST", "/api/session/start");
    let nudges = [];
    for (let i = 0; i < 60 && nudges.length === 0; i++) {
      await sleep(500);
      nudges = (await bob.request("GET", "/api/snapshot")).body.nudges;
    }
    assert(nudges.length > 0, "no nudge within 30 s");
    // Slow the timer down so the next fire falls after the restart below.
    const slowed = await bob.request("PATCH", `/api/timers/${timer.body.id}`, {
      intervalSeconds: 20,
    });
    fireAt = slowed.body.nextFireAt;
    return `${nudges[0].source}: ${JSON.stringify(nudges[0].message)}`;
  });

  await check("a nudge still fires after celld dev is killed and restarted mid-sleep", async () => {
    assert(fireAt, "previous check failed");
    const countBefore = (await bob.request("GET", "/api/snapshot")).body.nudges.length;
    await sleep(3_000); // let the alarm write for the re-armed sleep become durable
    killCelld();
    await sleep(1_000);
    await startCelld(false);
    // Do not touch the workspace until well after the fire time: only its alarm may wake it.
    const quietUntil = Math.max(fireAt + 8_000, Date.now() + 2_000);
    await sleep(quietUntil - Date.now());
    const firstTouch = Date.now();
    const after = (await bob.request("GET", "/api/snapshot")).body;
    const fired = after.nudges.filter((n) => n.firedAt >= fireAt);
    if (after.nudges.length > countBefore && fired.length > 0) {
      const turn = (await bob.request("GET", "/api/turns")).body.turns.find(
        (t) => t.trigger === "nudge" && t.at >= fireAt,
      );
      const byAlarm = turn ? turn.at < firstTouch : "unknown";
      return `fired at +${fired[0].firedAt - fireAt} ms of schedule; woken by alarm before any request: ${byAlarm}`;
    }
    // Not yet: celld's fallback heartbeat alarm (60 s) must still deliver it without a request.
    await sleep(65_000);
    const late = (await bob.request("GET", "/api/snapshot")).body.nudges.filter(
      (n) => n.firedAt >= fireAt,
    );
    assert(late.length > 0, "the nudge never fired after the restart");
    return "fired only via the 60 s recovery heartbeat";
  });

  await check("ending the session writes a debrief and stops timers", async () => {
    const ended = await bob.request("POST", "/api/session/end");
    assert(ended.status === 200, JSON.stringify(ended));
    assert(
      ended.body.status === "ended" && ended.body.debrief,
      `session ${JSON.stringify(ended.body)}`,
    );
    const snap = (await bob.request("GET", "/api/snapshot")).body;
    assert(
      snap.timers.every((t) => t.nextFireAt === null),
      "timers must stop with the session",
    );
    return `${ended.body.debriefSource}: ${JSON.stringify(ended.body.debrief)}`;
  });
} catch (error) {
  console.log(`FAIL setup: ${error?.stack ?? error}`);
  results.push({ name: "setup", ok: false });
} finally {
  killCelld();
  await sleep(500);
  rmSync(project, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
