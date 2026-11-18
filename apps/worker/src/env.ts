import {
  createModels,
  InMemoryCredentialStore,
  type Models,
  type Provider,
} from "@earendil-works/pi-ai";
import { groqProvider } from "@earendil-works/pi-ai/providers/groq";
import { DEFAULT_CONFIG, type CoachConfig } from "@vitask/coach";

import type { AuthSettings } from "./auth.ts";
import type { WorkspaceObject } from "./workspace-object.ts";

export interface Env {
  readonly WORKSPACE: DurableObjectNamespace<WorkspaceObject>;
  readonly ASSETS?: Fetcher;
  /** Accounts, sessions, passkeys and auth rate limits (Better Auth). Workspace data stays in WORKSPACE. */
  readonly DB: D1Database;
  readonly COOKIE_SECRET?: string;
  /** The app's public URL (origin), e.g. https://vitask.example.com. Passkeys are bound to its hostname. */
  readonly BETTER_AUTH_URL?: string;
  readonly BETTER_AUTH_SECRET?: string;
  /** "apply": the Worker applies migrations/ to DB itself. Development on celld only (src/dev-migrations.ts). */
  readonly D1_DEV_MIGRATIONS?: string;
  /** Comma-separated extra origins allowed to call the API, for a UI dev server on another port. */
  readonly ALLOWED_ORIGINS?: string;
  readonly COACH_PROVIDER?: string;
  readonly COACH_MODEL?: string;
  readonly DAILY_TOKEN_BUDGET?: string;
  readonly CHAT_RATE_LIMIT_PER_MINUTE?: string;
  readonly MAX_SESSION_MINUTES?: string;
  readonly MIN_TIMER_INTERVAL_SECONDS?: string;
  readonly APPROVAL_TTL_SECONDS?: string;
  readonly GROQ_API_KEY?: string;
}

/** Providers this Worker bundles, with the variable that holds each key. Add one here to make it selectable. */
const PROVIDERS: Record<string, { create: () => Provider; keyVar: keyof Env }> = {
  groq: { create: groqProvider, keyVar: "GROQ_API_KEY" },
};

function positive(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid numeric variable: ${value}`);
  return parsed;
}

export function extraOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

/** The auth settings, or the names of the missing variables. */
export function authSettingsFromEnv(env: Env): AuthSettings | { missing: string[] } {
  const required = ["BETTER_AUTH_URL", "BETTER_AUTH_SECRET", "COOKIE_SECRET"] as const;
  const missing = required.filter((name) => !env[name]);
  if (missing.length > 0) return { missing };
  return {
    appUrl: env.BETTER_AUTH_URL!,
    secret: env.BETTER_AUTH_SECRET!,
    cookieSecret: env.COOKIE_SECRET!,
    extraOrigins: extraOrigins(env),
  };
}

export function configFromEnv(env: Env): CoachConfig {
  return {
    ...DEFAULT_CONFIG,
    provider: env.COACH_PROVIDER || DEFAULT_CONFIG.provider,
    model: env.COACH_MODEL || DEFAULT_CONFIG.model,
    dailyTokenBudget: positive(env.DAILY_TOKEN_BUDGET, DEFAULT_CONFIG.dailyTokenBudget),
    chatPerMinute: positive(env.CHAT_RATE_LIMIT_PER_MINUTE, DEFAULT_CONFIG.chatPerMinute),
    maxSessionMs: positive(env.MAX_SESSION_MINUTES, DEFAULT_CONFIG.maxSessionMs / 60_000) * 60_000,
    minTimerIntervalSeconds: positive(
      env.MIN_TIMER_INTERVAL_SECONDS,
      DEFAULT_CONFIG.minTimerIntervalSeconds,
    ),
    approvalTtlMs: positive(env.APPROVAL_TTL_SECONDS, DEFAULT_CONFIG.approvalTtlMs / 1000) * 1000,
  };
}

/** pi-ai models with the configured provider; Workers have no `process.env`, so the key goes in a credential store. */
export async function modelsFromEnv(env: Env, config: CoachConfig): Promise<Models> {
  const entry = PROVIDERS[config.provider];
  if (!entry) throw new Error(`Unsupported COACH_PROVIDER "${config.provider}"`);
  const credentials = new InMemoryCredentialStore();
  const key = env[entry.keyVar];
  if (typeof key === "string" && key !== "") {
    await credentials.modify(config.provider, async () => ({ type: "api_key", key }));
  }
  const models = createModels({ credentials });
  models.setProvider(entry.create());
  return models;
}
