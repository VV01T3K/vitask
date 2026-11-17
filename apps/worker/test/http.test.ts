import { describe, expect, it } from "vite-plus/test";

import { originAllowed } from "../src/http.ts";

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
