const COOKIE = "vitask_ws";
const YEAR_SECONDS = 365 * 24 * 60 * 60;
const ID_PATTERN = /^[0-9a-f]{32}$/;

export type Identity = {
  readonly workspaceId: string;
  /** Set when the request had no valid cookie and a new anonymous workspace was minted. */
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

export async function verifiedWorkspace(
  cookieHeader: string | null,
  secret: string,
): Promise<string | undefined> {
  const value = readCookie(cookieHeader, COOKIE);
  const [workspaceId, signature] = value?.split(".") ?? [];
  if (!workspaceId || !signature || !ID_PATTERN.test(workspaceId)) return undefined;
  return timingSafeEqual(signature, await sign(secret, workspaceId)) ? workspaceId : undefined;
}

/**
 * The seam where a later stage plugs in real login: today every browser gets an anonymous workspace, named by a
 * signed, httpOnly cookie. `mint: false` refuses instead of creating one (WebSocket upgrades).
 */
export async function resolveIdentity(
  request: Request,
  secret: string,
  options: { mint: boolean },
): Promise<Identity | undefined> {
  const existing = await verifiedWorkspace(request.headers.get("Cookie"), secret);
  if (existing) return { workspaceId: existing };
  if (!options.mint) return undefined;
  const workspaceId = crypto.randomUUID().replaceAll("-", "");
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const cookie = `${COOKIE}=${workspaceId}.${await sign(secret, workspaceId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${YEAR_SECONDS}${secure}`;
  return { workspaceId, setCookie: cookie };
}
