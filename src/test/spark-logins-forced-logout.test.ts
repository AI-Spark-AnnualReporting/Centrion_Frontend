// A 401 logs the user out through api.ts logout(), not AuthContext. That path
// must also clear the Spark lead-creation hand-off, or the next person to sign
// in on this tab sees another company's new logins.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { logout, sparkInternal } from "@/lib/api";

/** Return a fake fetch Response with the given status and JSON body. */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("forced logout clears the Spark login keys", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.setItem("auth_token", "expired-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("api.ts logout() removes spark:newLogins:*", () => {
    sessionStorage.setItem("spark:newLogins:c1", JSON.stringify({ ok: false, error: "x" }));
    sessionStorage.setItem("unrelated", "keep");

    logout();

    expect(sessionStorage.getItem("spark:newLogins:c1")).toBeNull();
    expect(sessionStorage.getItem("unrelated")).toBe("keep");
  });

  it("a 401 response clears a saved new-logins record", async () => {
    sessionStorage.setItem("spark:newLogins:c1", JSON.stringify({ ok: false, error: "x" }));
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(401, { detail: "Not authenticated" })));
    // jsdom cannot navigate; the redirect to /login is not what this test checks.
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(sparkInternal.logins("c1")).rejects.toBeTruthy();

    expect(sessionStorage.getItem("spark:newLogins:c1")).toBeNull();
  });
});
