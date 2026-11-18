const COOKIE = "vitask_ws";
const YEAR_SECONDS = 365 * 24 * 60 * 60;
const ID_PATTERN = /^[0-9a-f]{32}$/;

/**
 * Who owns which workspace. A workspace is either anonymous (named by a signed cookie, no server record) or belongs
 * to exactly one account (the account's `workspaceId`). Once an account owns a workspace, only that account's
 * session reaches it: the anonymous cookie that named it stops working.
 */
export interface Accounts {
  /** The workspace of the account signed in on this request, if any. */
  sessionWorkspace(request: Request): Promise<string | undefined>;
  /** Whether some account owns the workspace. */
  owns(workspaceId: string): Promise<boolean>;
}

export type Identity = {
  readonly workspaceId: string;
  readonly kind: "account" | "anonymous";
  /** Set when the request had no usable anonymous cookie and a new anonymous workspace was minted. */
  readonly setCookie?: string;
};

const encoder = new TextEncoder();

function base64url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(secret: string, workspaceId: string): Promise<string> {
  return base64url(
    await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(`workspace:${workspaceId}`)),
  );
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function readCookie(header: string | null, name: string): string | undefined {
  for (const part of header?.split(";") ?? []) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) return rest.join("=");
  }
  return undefined;
}

export function newWorkspaceId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

export async function verifiedWorkspace(
  cookieHeader: string | null,
  secret: string,
): Promise<string | undefined> {
  const value = readCookie(cookieHeader, COOKIE);
  const [workspaceId, signature] = value?.split(".") ?? [];
  if (!workspaceId || !signature || !ID_PATTERN.test(workspaceId)) return undefined;
  return timingSafeEqual(signature, await sign(secret, workspaceId)) ? workspaceId : undefined;
}

/** The anonymous workspace the cookie names, unless an account has claimed it since. */
export async function anonymousWorkspace(
  cookieHeader: string | null,
  secret: string,
  accounts: Pick<Accounts, "owns">,
): Promise<string | undefined> {
  const workspaceId = await verifiedWorkspace(cookieHeader, secret);
  if (!workspaceId) return undefined;
  return (await accounts.owns(workspaceId)) ? undefined : workspaceId;
}

/**
 * The workspace for a new account: the visitor's anonymous workspace when they have one, so signing up keeps their
 * data, or a fresh one.
 */
export async function workspaceForNewAccount(
  cookieHeader: string | null,
  secret: string,
  accounts: Pick<Accounts, "owns">,
): Promise<string> {
  return (await anonymousWorkspace(cookieHeader, secret, accounts)) ?? newWorkspaceId();
}

/**
 * Which workspace a request reaches: the signed-in account's, else the anonymous one its cookie names. Without
 * either, a new anonymous workspace is minted, or refused with `mint: false` (WebSocket upgrades). `secure` marks
 * the cookie `Secure`; it follows the app's configured URL, not the request (behind a proxy the request is http).
 */
export async function resolveIdentity(
  request: Request,
  secret: string,
  accounts: Accounts,
  options: { mint: boolean; secure: boolean },
): Promise<Identity | undefined> {
  const signedIn = await accounts.sessionWorkspace(request);
  if (signedIn) return { workspaceId: signedIn, kind: "account" };
  const anonymous = await anonymousWorkspace(request.headers.get("Cookie"), secret, accounts);
  if (anonymous) return { workspaceId: anonymous, kind: "anonymous" };
  if (!options.mint) return undefined;
  const workspaceId = newWorkspaceId();
  const secure = options.secure ? "; Secure" : "";
  const cookie = `${COOKIE}=${workspaceId}.${await sign(secret, workspaceId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${YEAR_SECONDS}${secure}`;
  return { workspaceId, kind: "anonymous", setCookie: cookie };
}
