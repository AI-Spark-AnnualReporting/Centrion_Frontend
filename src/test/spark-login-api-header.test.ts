// The Spark login calls name the company in the URL and must never carry
// X-Company-Id: Spark makes them from the directory and the wizard, where the
// acting company may be unset or a different one (pattern from
// spark-acting-company-header.test.ts).

import { describe, it, expect, beforeEach, vi } from "vitest";

import { setActingCompany } from "@/lib/acting-company";

describe("Spark login API calls", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    // A stale acting company that is NOT the one in the URL.
    setActingCompany({ id: "cmp_other", name: "Other" });
    fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  const headersOf = (call: number) =>
    (fetchMock.mock.calls[call][1]?.headers ?? {}) as Record<string, string>;
  const urlOf = (call: number) => String(fetchMock.mock.calls[call][0]);
  const methodOf = (call: number) => fetchMock.mock.calls[call][1]?.method ?? "GET";
  const bodyOf = (call: number) => {
    const body = fetchMock.mock.calls[call][1]?.body;
    return body === undefined ? undefined : JSON.parse(String(body));
  };

  it("emailAvailable sends no X-Company-Id and passes the email", async () => {
    const { sparkInternal } = await import("@/lib/api");
    await sparkInternal.emailAvailable("aramco@admin.com");
    expect(headersOf(0)["X-Company-Id"]).toBeUndefined();
    expect(urlOf(0)).toContain("/api/v1/spark/email-available?email=aramco%40admin.com");
  });

  it("leadEmails sends one name= per department name", async () => {
    const { sparkInternal } = await import("@/lib/api");
    await sparkInternal.leadEmails("cmp_1", ["Finance", "Legal, Risk"]);
    expect(headersOf(0)["X-Company-Id"]).toBeUndefined();
    expect(urlOf(0)).toContain(
      "/api/v1/spark/companies/cmp_1/lead-emails?name=Finance&name=Legal%2C+Risk",
    );
  });

  it("leadEmails leaves name out when there are none", async () => {
    const { sparkInternal } = await import("@/lib/api");
    await sparkInternal.leadEmails("cmp_1", []);
    expect(urlOf(0)).toMatch(/\/lead-emails$/);
  });

  it("createLeads posts an empty body with no X-Company-Id", async () => {
    const { sparkInternal } = await import("@/lib/api");
    await sparkInternal.createLeads("cmp_1");
    expect(headersOf(0)["X-Company-Id"]).toBeUndefined();
    expect(methodOf(0)).toBe("POST");
    expect(urlOf(0)).toContain("/api/v1/spark/companies/cmp_1/leads");
    expect(bodyOf(0)).toEqual({});
  });

  it("logins sends no X-Company-Id", async () => {
    const { sparkInternal } = await import("@/lib/api");
    await sparkInternal.logins("cmp_1");
    expect(headersOf(0)["X-Company-Id"]).toBeUndefined();
    expect(urlOf(0)).toContain("/api/v1/spark/companies/cmp_1/logins");
  });

  it("resetPassword posts to the user under the company, with no X-Company-Id", async () => {
    const { sparkInternal } = await import("@/lib/api");
    await sparkInternal.resetPassword("cmp_1", "usr_9");
    expect(headersOf(0)["X-Company-Id"]).toBeUndefined();
    expect(methodOf(0)).toBe("POST");
    expect(urlOf(0)).toContain("/api/v1/spark/companies/cmp_1/users/usr_9/reset-password");
  });

  it("createCompany without admin sends no admin key", async () => {
    const { sparkInternal } = await import("@/lib/api");
    await sparkInternal.createCompany({ name: "Acme" });
    expect(headersOf(0)["X-Company-Id"]).toBeUndefined();
    expect(bodyOf(0)).toEqual({ name: "Acme" });
  });
});
