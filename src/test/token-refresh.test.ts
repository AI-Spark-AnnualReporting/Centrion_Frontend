// Refresh tokens: the access token lasts 15 minutes, the refresh token 7 days.
// When a request comes back 401, api.ts swaps the refresh token for a new pair
// and sends the request again — once. These tests pin the cases where getting
// it wrong logs people out (the bug this feature fixes) or keeps them in when
// they should be out.
// Plan: Centriton/.claude/plans/refresh-token.md

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ApiError,
  auth,
  getAuthToken,
  getRefreshToken,
  logout,
  setAuthToken,
  setRefreshToken,
} from "@/lib/api";
import { buildSarHandoffUrl, redirectToApp, resetRedirectGuardForTests } from "@/lib/appRouting";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const isRefreshCall = (url: string) => url.endsWith("/api/v1/auth/refresh");
const isMeCall = (url: string) => url.endsWith("/api/v1/auth/me");

/** The Authorization header a fetch call carried. */
function bearerOf(init: RequestInit | undefined): string | null {
  return new Headers(init?.headers).get("Authorization");
}

let fetchMock: ReturnType<typeof vi.fn>;
const assign = vi.fn();
const originalLocation = window.location;

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  // handleUnauthorized() sends the browser to /login; record it instead.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, pathname: "/dashboard", href: "http://app.test/dashboard", assign },
  });
  assign.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});

describe("refresh then retry", () => {
  it("renews an expired access token and sends the request again", async () => {
    setAuthToken("access-old");
    setRefreshToken("refresh-1");
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (isRefreshCall(url)) return json(200, { access_token: "access-new", refresh_token: "refresh-2" });
      return bearerOf(init) === "Bearer access-new" ? json(200, { user_id: "usr_1" }) : json(401, {});
    });

    await expect(auth.me()).resolves.toEqual({ user_id: "usr_1" });

    expect(getAuthToken()).toBe("access-new");
    expect(getRefreshToken()).toBe("refresh-2");
    expect(assign).not.toHaveBeenCalled();
    const refreshBody = JSON.parse(fetchMock.mock.calls.find((c) => isRefreshCall(c[0]))![1].body);
    expect(refreshBody).toEqual({ refresh_token: "refresh-1" });
  });

  it("asks for one refresh when several requests 401 at once", async () => {
    setAuthToken("access-old");
    setRefreshToken("refresh-1");
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (isRefreshCall(url)) return json(200, { access_token: "access-new", refresh_token: "refresh-2" });
      return bearerOf(init) === "Bearer access-new" ? json(200, {}) : json(401, {});
    });

    await Promise.all([auth.me(), auth.me(), auth.me()]);

    expect(fetchMock.mock.calls.filter((c) => isRefreshCall(c[0]))).toHaveLength(1);
  });

  it("uses a token another tab already renewed instead of refreshing again", async () => {
    setAuthToken("access-old");
    setRefreshToken("refresh-1");
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (bearerOf(init) === "Bearer access-old") {
        // While this request was out, the other tab refreshed and saved new tokens.
        setAuthToken("access-from-other-tab");
        return json(401, {});
      }
      return json(200, {});
    });

    await auth.me();

    expect(fetchMock.mock.calls.some((c) => isRefreshCall(c[0]))).toBe(false);
    expect(bearerOf(fetchMock.mock.calls[1][1])).toBe("Bearer access-from-other-tab");
  });

  it("takes the lock so only one tab refreshes at a time", async () => {
    const request = vi.fn((_name: string, work: () => Promise<unknown>) => work());
    vi.stubGlobal("navigator", { ...navigator, locks: { request } });
    setAuthToken("access-old");
    setRefreshToken("refresh-1");
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (isRefreshCall(url)) return json(200, { access_token: "access-new", refresh_token: "refresh-2" });
      return bearerOf(init) === "Bearer access-new" ? json(200, {}) : json(401, {});
    });

    await auth.me();

    expect(request).toHaveBeenCalledWith("centriton-token-refresh", expect.any(Function));
  });

  it("signs out when the server refuses the refresh token", async () => {
    setAuthToken("access-old");
    setRefreshToken("refresh-dead");
    fetchMock.mockImplementation(async () => json(401, {}));

    await expect(auth.me()).rejects.toBeInstanceOf(ApiError);

    expect(getAuthToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(assign).toHaveBeenCalledWith("/login");
  });

  it("stays signed in when the server can't be reached to refresh", async () => {
    setAuthToken("access-old");
    setRefreshToken("refresh-1");
    fetchMock.mockImplementation(async (url: string) => {
      if (isRefreshCall(url)) throw new TypeError("Failed to fetch");
      return json(401, {});
    });

    await expect(auth.me()).rejects.toThrow(/renew your session/);

    expect(getAuthToken()).toBe("access-old");
    expect(getRefreshToken()).toBe("refresh-1");
    expect(assign).not.toHaveBeenCalled();
  });

  it("without a refresh token, a 401 signs out as before", async () => {
    setAuthToken("access-old");
    fetchMock.mockImplementation(async () => json(401, {}));

    await expect(auth.me()).rejects.toBeInstanceOf(ApiError);

    expect(fetchMock.mock.calls.some((c) => isRefreshCall(c[0]))).toBe(false);
    expect(assign).toHaveBeenCalledWith("/login");
  });

  it("a 400 (e.g. wrong old password) never signs out", async () => {
    setAuthToken("access-1");
    setRefreshToken("refresh-1");
    fetchMock.mockImplementation(async () => json(400, { detail: "Old password incorrect" }));

    await expect(auth.changePassword({ new_password: "x".repeat(10) })).rejects.toBeInstanceOf(ApiError);

    expect(getAuthToken()).toBe("access-1");
    expect(assign).not.toHaveBeenCalled();
  });

  it("does not try to refresh a call made without a login (e.g. /auth/login)", async () => {
    setRefreshToken("refresh-1");
    fetchMock.mockImplementation(async () => json(401, { detail: "Invalid email or password" }));

    await expect(auth.login({ email: "a@b.com", password: "wrong" })).rejects.toBeInstanceOf(ApiError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getRefreshToken()).toBe("refresh-1");
  });
});

describe("logout", () => {
  it("ends the session on the server and forgets both tokens", () => {
    setAuthToken("access-1");
    setRefreshToken("refresh-1");
    fetchMock.mockResolvedValue(json(200, { logged_out: true }));

    logout();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/auth\/logout$/);
    expect(JSON.parse(init.body)).toEqual({ refresh_token: "refresh-1" });
    expect(getAuthToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it("with no refresh token, makes no server call", () => {
    setAuthToken("access-1");
    logout();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("hand-off to the SAR app", () => {
  beforeEach(() => resetRedirectGuardForTests());

  it("puts a new SAR refresh token after # — never the access token in the query", async () => {
    setAuthToken("access-1");
    fetchMock.mockResolvedValue(json(200, { refresh_token: "sar-refresh-1" }));

    const link = (await buildSarHandoffUrl({ next: "/pm", company: "cmp_1", back: "http://app.test/x" }))!;

    const url = new URL(link);
    expect(url.pathname).toBe("/auth/token");
    expect(url.searchParams.get("token")).toBeNull();
    expect(url.searchParams.get("next")).toBe("/pm");
    expect(url.searchParams.get("company")).toBe("cmp_1");
    expect(new URLSearchParams(url.hash.slice(1)).get("refresh_token")).toBe("sar-refresh-1");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ app: "sar" });
  });

  it("falls back to the old ?token= link when the server has no hand-off yet", async () => {
    setAuthToken("access-1");
    fetchMock.mockResolvedValue(json(404, { detail: "Not Found" }));

    const url = new URL((await buildSarHandoffUrl({ next: "/pm" }))!);

    expect(url.searchParams.get("token")).toBe("access-1");
    expect(url.hash).toBe("");
  });

  it("never puts the token in the link when the hand-off fails for another reason", async () => {
    setAuthToken("access-1");
    fetchMock.mockResolvedValue(json(500, { detail: "database unavailable" }));

    expect(await buildSarHandoffUrl({ next: "/pm" })).toBeNull();
  });

  it("has nothing to hand over when signed out", async () => {
    expect(await buildSarHandoffUrl({ next: "/pm" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks for only one SAR session however often it is called while leaving", async () => {
    setAuthToken("access-1");
    fetchMock.mockResolvedValue(json(200, { refresh_token: "sar-refresh-1" }));

    await Promise.all([redirectToApp("spark_studio"), redirectToApp("spark_studio"), redirectToApp("spark_studio")]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
