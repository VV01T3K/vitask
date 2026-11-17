import { describe, expect, it } from "vite-plus/test";

import { originAllowed } from "../src/http.ts";
import { resolveIdentity, verifiedWorkspace } from "../src/identity.ts";

describe("identity", () => {
  it("mints a signed workspace cookie and verifies it", async () => {
    const minted = await resolveIdentity(new Request("https://app.test/api/snapshot"), "secret", {
      mint: true,
    });
    expect(minted?.setCookie).toMatch(
      /^vitask_ws=[0-9a-f]{32}\.[\w-]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+; Secure$/,
    );
    const cookie = minted!.setCookie!.split(";")[0]!;
    expect(await verifiedWorkspace(cookie, "secret")).toBe(minted!.workspaceId);
    const again = await resolveIdentity(
      new Request("https://app.test/", { headers: { Cookie: `a=b; ${cookie}` } }),
      "secret",
      { mint: true },
    );
    expect(again).toEqual({ workspaceId: minted!.workspaceId });
  });

  it("rejects tampered or foreign cookies", async () => {
    const minted = await resolveIdentity(new Request("http://app.test/"), "secret", { mint: true });
    const [name, value] = minted!.setCookie!.split(";")[0]!.split("=");
    const [id, signature] = value!.split(".");
    expect(
      await verifiedWorkspace(`${name}=${"0".repeat(32)}.${signature}`, "secret"),
    ).toBeUndefined();
    expect(await verifiedWorkspace(`${name}=${id}.${signature}`, "other-secret")).toBeUndefined();
    expect(
      await resolveIdentity(new Request("http://app.test/"), "secret", { mint: false }),
    ).toBeUndefined();
  });
});

describe("origin check", () => {
  const post = (origin?: string, site?: string) =>
    new Request("https://app.test/api/tasks", {
      method: "POST",
      headers: {
        ...(origin ? { Origin: origin } : {}),
        ...(site ? { "Sec-Fetch-Site": site } : {}),
      },
    });

  it("allows same origin, configured origins and non-browser clients", () => {
    expect(originAllowed(post("https://app.test"), undefined)).toBe(true);
    expect(
      originAllowed(post("http://localhost:5173"), "http://localhost:5173, https://x.test"),
    ).toBe(true);
    expect(originAllowed(post(), undefined)).toBe(true);
  });

  it("refuses foreign origins", () => {
    expect(originAllowed(post("https://evil.test"), undefined)).toBe(false);
    expect(originAllowed(post("https://evil.test"), "")).toBe(false);
    expect(originAllowed(post(undefined, "cross-site"), undefined)).toBe(false);
  });
});
