import { describe, expect, it } from "vite-plus/test";

import {
  resolveIdentity,
  verifiedWorkspace,
  workspaceForNewAccount,
  type Accounts,
} from "../src/identity.ts";

const SECRET = "secret";

/** Accounts in memory: a session token names a user, a user owns one workspace. */
class FakeAccounts implements Accounts {
  readonly users = new Map<string, { workspaceId: string }>();
  readonly sessions = new Map<string, string>();

  async sessionWorkspace(request: Request) {
    const token = /(?:^|; )session=([^;]+)/.exec(request.headers.get("Cookie") ?? "")?.[1];
    const userId = token ? this.sessions.get(token) : undefined;
    return userId ? this.users.get(userId)?.workspaceId : undefined;
  }
  async owns(workspaceId: string) {
    return [...this.users.values()].some((user) => user.workspaceId === workspaceId);
  }
  /** What the user-create hook does at sign-up, then a session for the new account. */
  async signUp(cookies: string, userId: string): Promise<string> {
    const workspaceId = await workspaceForNewAccount(cookies, SECRET, this);
    this.users.set(userId, { workspaceId });
    return this.signIn(userId);
  }
  signIn(userId: string): string {
    const token = `token-${userId}-${this.sessions.size}`;
    this.sessions.set(token, userId);
    return `session=${token}`;
  }
}

/** A browser's cookie jar, enough for these flows. */
class Browser {
  anonymous = "";
  session = "";
  get cookies() {
    return [this.anonymous, this.session].filter(Boolean).join("; ");
  }
  async visit(accounts: Accounts, options = { mint: true }) {
    const identity = await resolveIdentity(
      new Request("https://app.test/api/snapshot", { headers: { Cookie: this.cookies } }),
      SECRET,
      accounts,
      { ...options, secure: true },
    );
    if (identity?.setCookie) this.anonymous = identity.setCookie.split(";")[0]!;
    return identity;
  }
}

describe("identity", () => {
  it("mints a signed anonymous workspace cookie and keeps using it", async () => {
    const accounts = new FakeAccounts();
    const browser = new Browser();
    const minted = await browser.visit(accounts);
    expect(minted?.kind).toBe("anonymous");
    expect(minted?.setCookie).toMatch(
      /^vitask_ws=[0-9a-f]{32}\.[\w-]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+; Secure$/,
    );
    expect(await verifiedWorkspace(browser.anonymous, SECRET)).toBe(minted!.workspaceId);
    expect(await browser.visit(accounts)).toEqual({
      workspaceId: minted!.workspaceId,
      kind: "anonymous",
    });
  });

  it("rejects tampered or foreign cookies and refuses to mint for sockets", async () => {
    const accounts = new FakeAccounts();
    const browser = new Browser();
    await browser.visit(accounts);
    const [name, value] = browser.anonymous.split("=");
    const [id, signature] = value!.split(".");
    expect(
      await verifiedWorkspace(`${name}=${"0".repeat(32)}.${signature}`, SECRET),
    ).toBeUndefined();
    expect(await verifiedWorkspace(`${name}=${id}.${signature}`, "other-secret")).toBeUndefined();
    expect(await new Browser().visit(accounts, { mint: false })).toBeUndefined();
  });

  it("maps a signed-in request to its account's workspace, whatever anonymous cookie it carries", async () => {
    const accounts = new FakeAccounts();
    accounts.users.set("u1", { workspaceId: "a".repeat(32) });
    const browser = new Browser();
    await browser.visit(accounts);
    browser.session = accounts.signIn("u1");
    expect(await browser.visit(accounts)).toEqual({
      workspaceId: "a".repeat(32),
      kind: "account",
    });
    expect(await browser.visit(accounts, { mint: false })).toMatchObject({ kind: "account" });
  });

  it("keeps the anonymous workspace as the account's at sign-up; signing out starts a fresh one", async () => {
    const accounts = new FakeAccounts();
    const browser = new Browser();
    const anonymous = (await browser.visit(accounts))!.workspaceId;

    browser.session = await accounts.signUp(browser.cookies, "u1");
    expect(accounts.users.get("u1")).toEqual({ workspaceId: anonymous });
    expect(await browser.visit(accounts)).toEqual({ workspaceId: anonymous, kind: "account" });

    // Signed out: the old anonymous cookie no longer reaches the account's workspace.
    browser.session = "";
    const fresh = await browser.visit(accounts);
    expect(fresh?.kind).toBe("anonymous");
    expect(fresh?.workspaceId).not.toBe(anonymous);
    expect(fresh?.setCookie).toBeDefined();
    // Even a copy of the old cookie is refused.
    const stale = await resolveIdentity(
      new Request("https://app.test/", { headers: { Cookie: browser.anonymous } }),
      SECRET,
      accounts,
      { mint: false, secure: true },
    );
    expect(stale?.workspaceId).not.toBe(anonymous);
  });

  it("signing in from an anonymous session keeps the account's workspace and leaves the anonymous one", async () => {
    const accounts = new FakeAccounts();
    const owner = new Browser();
    await owner.visit(accounts);
    owner.session = await accounts.signUp(owner.cookies, "u1");
    const accountWorkspace = accounts.users.get("u1")!.workspaceId;

    const elsewhere = new Browser();
    const anonymous = (await elsewhere.visit(accounts))!.workspaceId;
    elsewhere.session = accounts.signIn("u1");
    expect(await elsewhere.visit(accounts)).toEqual({
      workspaceId: accountWorkspace,
      kind: "account",
    });
    expect(accounts.users.get("u1")).toEqual({ workspaceId: accountWorkspace });

    // No merge: after signing out, that browser is back in its own anonymous workspace.
    elsewhere.session = "";
    expect(await elsewhere.visit(accounts)).toEqual({ workspaceId: anonymous, kind: "anonymous" });
  });

  it("gives a new account a fresh workspace when the visitor has none or it is already owned", async () => {
    const accounts = new FakeAccounts();
    expect(await workspaceForNewAccount(null, SECRET, accounts)).toMatch(/^[0-9a-f]{32}$/);
    const browser = new Browser();
    const anonymous = (await browser.visit(accounts))!.workspaceId;
    await accounts.signUp(browser.cookies, "u1");
    // A second sign-up replaying the same (now owned) cookie cannot take the workspace.
    const second = await workspaceForNewAccount(browser.anonymous, SECRET, accounts);
    expect(second).not.toBe(anonymous);
  });
});
