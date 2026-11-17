import { passkey } from "@better-auth/passkey";
import { betterAuth, type BetterAuthOptions } from "better-auth";

import { workspaceForNewAccount, type Accounts } from "./identity.ts";

/** Everything the auth setup reads from the environment, already validated. */
export type AuthSettings = {
  /** The app's public URL; passkeys are bound to its hostname and origin. */
  readonly appUrl: string;
  readonly secret: string;
  /** Signs the anonymous workspace cookie, which sign-up reads to keep the visitor's data. */
  readonly cookieSecret: string;
  /** Other origins allowed to call the API (a UI dev server on another port). */
  readonly extraOrigins: readonly string[];
};

type Adapter = {
  count(query: { model: string; where: { field: string; value: string }[] }): Promise<number>;
};

async function ownedBy(adapter: Adapter, workspaceId: string): Promise<boolean> {
  return (
    (await adapter.count({
      model: "user",
      where: [{ field: "workspaceId", value: workspaceId }],
    })) > 0
  );
}

/**
 * Better Auth with passkeys, users and sessions in D1. Each account names its workspace object with `workspaceId`;
 * the user-create hook is the one place that picks it, so a sign-up adopts the visitor's anonymous workspace.
 */
export function authOptions(settings: AuthSettings, database: BetterAuthOptions["database"]) {
  const app = new URL(settings.appUrl);
  return {
    appName: "vitask",
    baseURL: app.origin,
    basePath: "/api/auth",
    secret: settings.secret,
    database,
    trustedOrigins: [app.origin, ...settings.extraOrigins],
    user: {
      additionalFields: {
        workspaceId: { type: "string", required: true, input: false, unique: true },
      },
    },
    session: {
      // A signed copy of the session in a cookie: most API requests skip the D1 read. A revoked session keeps
      // working on another device for at most this long.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    plugins: [
      passkey({
        rpID: app.hostname,
        rpName: "vitask",
        registration: {
          // Passkey-first sign-up: without a session the passkey creates the account. With one, it is added to it.
          requireSession: false,
          resolveUser: () => {
            const id = crypto.randomUUID().replaceAll("-", "");
            return { id, name: `vitask-${id.slice(0, 6)}`, displayName: "vitask" };
          },
          afterVerification: async ({ ctx, user }) => {
            const existing = await ctx.context.internalAdapter.findUserById(user.id);
            if (existing) return;
            const created = await ctx.context.internalAdapter.createUser(
              {
                name: user.name,
                // Better Auth requires an email; a passkey account has none. Same shape as its own placeholder
                // (RFC 6761 .invalid), never routable.
                email: `${user.id}@passkey.placeholder.invalid`,
                emailVerified: false,
              },
              { method: "passkey" },
            );
            return { userId: created.id };
          },
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (user, ctx) => {
            if (!ctx) throw new Error("Accounts are only created through the auth endpoints");
            const cookie = ctx.request?.headers.get("Cookie") ?? ctx.headers?.get("Cookie") ?? null;
            const workspaceId = await workspaceForNewAccount(cookie, settings.cookieSecret, {
              owns: (id) => ownedBy(ctx.context.adapter, id),
            });
            return { data: { ...user, workspaceId } };
          },
        },
      },
    },
    rateLimit: {
      enabled: true,
      // Per-isolate memory would not limit anything across Workers isolates or celld nodes.
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/passkey/*": { window: 60, max: 20 },
      },
    },
    advanced: {
      useSecureCookies: app.protocol === "https:",
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-real-ip"] },
    },
    telemetry: { enabled: false },
  } satisfies BetterAuthOptions;
}

export type Auth = ReturnType<typeof betterAuth<ReturnType<typeof authOptions>>>;

export function createAuth(settings: AuthSettings, database: D1Database): Auth {
  return betterAuth(authOptions(settings, database));
}

export function accountsFor(auth: Auth): Accounts {
  return {
    async sessionWorkspace(request) {
      // Read only: refreshing the session and its cookies is the auth handler's job (the client calls it).
      const session = await auth.api.getSession({
        headers: request.headers,
        query: { disableRefresh: true },
      });
      return session?.user.workspaceId;
    },
    async owns(workspaceId) {
      return ownedBy((await auth.$context).adapter, workspaceId);
    },
  };
}
