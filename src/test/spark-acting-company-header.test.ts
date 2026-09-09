// The X-Company-Id header is the entire company switch. Everything worth
// pinning here is a silent failure:
//
// 1. If the header is missing, a Spark request falls back to the caller's own
//    (NULL) company — pages render empty rather than erroring, so it looks like
//    "this client has no data" instead of a bug.
// 2. If it is cached in a module variable, a second tab keeps a stale company
//    and the next WRITE lands on the wrong tenant.
// 3. If logout doesn't clear it, the next person to log in on this browser
//    inherits a Spark session's acting company on every request.
// 4. The /spark/* endpoints must NOT carry it — they are what a Spark user
//    calls before choosing a company, and after one is deleted. Without the
//    opt-out a deleted company 404s the directory itself and the only way out
//    is logging out.

import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  clearActingCompany,
  getActingCompany,
  setActingCompany,
} from "@/lib/acting-company";

describe("acting-company store", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a company", () => {
    setActingCompany({ id: "cmp_1", name: "Acme" });
    expect(getActingCompany()).toEqual({ id: "cmp_1", name: "Acme" });
  });

  it("is null when nothing is set", () => {
    expect(getActingCompany()).toBeNull();
  });

  it("clears", () => {
    setActingCompany({ id: "cmp_1", name: "Acme" });
    clearActingCompany();
    expect(getActingCompany()).toBeNull();
  });

  it("survives a corrupt value rather than throwing", () => {
    localStorage.setItem("centriton_acting_company", "{not json");
    expect(getActingCompany()).toBeNull();
  });

  it("reads storage on every call, never caching", () => {
    // Stands in for another tab writing the key underneath us.
    setActingCompany({ id: "cmp_1", name: "Acme" });
    expect(getActingCompany()?.id).toBe("cmp_1");
    localStorage.setItem(
      "centriton_acting_company",
      JSON.stringify({ id: "cmp_2", name: "Bahri" }),
    );
    expect(getActingCompany()?.id).toBe("cmp_2");
  });
});

describe("outbound requests", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    localStorage.clear();
    fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  const headersOf = (call: number) =>
    (fetchMock.mock.calls[call][1]?.headers ?? {}) as Record<string, string>;

  it("carries X-Company-Id once a company is being acted on", async () => {
    setActingCompany({ id: "cmp_1", name: "Acme" });
    const { lookups } = await import("@/lib/api");
    await lookups.sectors();
    expect(headersOf(0)["X-Company-Id"]).toBe("cmp_1");
  });

  it("sends no X-Company-Id when acting on nobody", async () => {
    const { lookups } = await import("@/lib/api");
    await lookups.sectors();
    expect(headersOf(0)["X-Company-Id"]).toBeUndefined();
  });

  it("reaches the SAR backend too — sarRequest delegates to request", async () => {
    setActingCompany({ id: "cmp_1", name: "Acme" });
    const { sarCycles } = await import("@/lib/api");
    await sarCycles.list();
    expect(headersOf(0)["X-Company-Id"]).toBe("cmp_1");
  });

  it("omits the header on /spark/* so the directory stays reachable", async () => {
    setActingCompany({ id: "cmp_deleted", name: "Gone" });
    const { sparkInternal } = await import("@/lib/api");
    await sparkInternal.companies();
    expect(headersOf(0)["X-Company-Id"]).toBeUndefined();
  });

  it("logout clears the acting company", async () => {
    setActingCompany({ id: "cmp_1", name: "Acme" });
    const { logout } = await import("@/lib/api");
    logout();
    expect(getActingCompany()).toBeNull();
  });
});
