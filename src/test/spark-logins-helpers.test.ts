// Pure helpers behind the Spark admin + lead logins screens. The slug rule must
// match the backend's (spec section 1), or the email the modal suggests is not
// the one the server checks.

import { describe, it, expect, beforeEach, vi } from "vitest";

import { colorFor, DEPT_COLORS } from "@/lib/departmentColors";
import {
  clearAllSparkLoginKeys,
  isSparkPlaceholderEmail,
  makeSlug,
  readAndClearNewLogins,
  saveNewLogins,
  PM_EMAIL_DOMAIN,
  SPARK_TEMP_PASSWORD,
  suggestAdminEmail,
  suggestPmEmail,
} from "@/lib/sparkLogins";

describe("makeSlug", () => {
  it("lower-cases and joins words with one dash", () => {
    expect(makeSlug("Bank Al Jazeera", 40, "company")).toBe("bank-al-jazeera");
  });

  it("turns a department code with a space into a dash", () => {
    expect(makeSlug("CUSTOMER C", 15, "dept")).toBe("customer-c");
  });

  it("turns an underscore into a dash", () => {
    expect(makeSlug("PSYC_001", 15, "dept")).toBe("psyc-001");
  });

  it("spells & as and", () => {
    expect(makeSlug("Saudi Telecom & Co", 40, "company")).toBe("saudi-telecom-and-co");
  });

  it("spells & with no spaces as plain and, same as the spec and the backend", () => {
    // Spec section 1 and spark_accounts.make_slug: "R&D" -> "randd".
    expect(makeSlug("R&D", 40, "company")).toBe("randd");
    expect(makeSlug("AT&T", 40, "company")).toBe("atandt");
    expect(makeSlug("R&D Co", 40, "company")).toBe("randd-co");
    expect(suggestAdminEmail("R&D Holdings")).toBe("randd-holdings@admin.com");
  });

  it("collapses slashes and repeated punctuation and trims the ends", () => {
    expect(makeSlug("  /Legal // Compliance/ ", 40, "company")).toBe("legal-compliance");
  });

  it("falls back when nothing usable is left (Arabic name)", () => {
    expect(makeSlug("أرامكو السعودية", 40, "company")).toBe("company");
    expect(makeSlug("", 15, "dept")).toBe("dept");
  });

  it("caps at the max length and never ends on a dash", () => {
    const long = "a".repeat(300);
    expect(makeSlug(long, 40, "company")).toBe("a".repeat(40));
    // "bank-al-" is 8 characters; the trailing dash is trimmed after the cut.
    expect(makeSlug("Bank Al Jazeera", 8, "company")).toBe("bank-al");
  });
});

describe("suggestAdminEmail", () => {
  it("builds <slug>@admin.com", () => {
    expect(suggestAdminEmail("Aramco")).toBe("aramco@admin.com");
    expect(suggestAdminEmail("Bank Al Jazeera")).toBe("bank-al-jazeera@admin.com");
  });

  it("uses company when the name has no latin letters", () => {
    expect(suggestAdminEmail("بنك")).toBe("company@admin.com");
  });
});

describe("suggestPmEmail", () => {
  it("builds <slug>@pm.com with the same slug rule and cap as the admin email", () => {
    expect(PM_EMAIL_DOMAIN).toBe("pm.com");
    expect(suggestPmEmail("Aramco")).toBe("aramco@pm.com");
    expect(suggestPmEmail("Bank Al Jazeera")).toBe("bank-al-jazeera@pm.com");
    expect(suggestPmEmail("R&D Holdings")).toBe("randd-holdings@pm.com");
    // Same 40-character company part as the admin email.
    expect(suggestPmEmail("a".repeat(300))).toBe(`${"a".repeat(40)}@pm.com`);
  });

  it("uses company when the name has no latin letters", () => {
    expect(suggestPmEmail("بنك")).toBe("company@pm.com");
  });
});

describe("isSparkPlaceholderEmail", () => {
  it("accepts Spark's admin, PM and lead domains, in any case and with spaces", () => {
    expect(isSparkPlaceholderEmail("x@admin.com")).toBe(true);
    expect(isSparkPlaceholderEmail("x@pm.com")).toBe(true);
    expect(isSparkPlaceholderEmail("x@hod.com")).toBe(true);
    expect(isSparkPlaceholderEmail("  Acme@PM.com ")).toBe(true);
  });

  it("refuses real addresses, look-alike domains and junk", () => {
    expect(isSparkPlaceholderEmail("cfo@client.com")).toBe(false);
    // A subdomain or a longer name is someone's real address, not Spark's.
    expect(isSparkPlaceholderEmail("x@mail.pm.com")).toBe(false);
    expect(isSparkPlaceholderEmail("x@npm.com")).toBe(false);
    expect(isSparkPlaceholderEmail("pm.com")).toBe(false);
    expect(isSparkPlaceholderEmail("")).toBe(false);
    expect(isSparkPlaceholderEmail(null)).toBe(false);
    expect(isSparkPlaceholderEmail(undefined)).toBe(false);
  });
});

describe("SPARK_TEMP_PASSWORD", () => {
  it("is the fixed 1234 every Spark-made login starts on", () => {
    expect(SPARK_TEMP_PASSWORD).toBe("1234");
  });
});

describe("sessionStorage hand-off", () => {
  beforeEach(() => sessionStorage.clear());

  it("reads the new-logins record once, then it is gone", () => {
    const created = [
      { user_id: "usr_1", email: "acme-fin@hod.com", department_code: "FIN", department_name: "Finance" },
    ];
    saveNewLogins("cmp_1", { ok: true, created, skipped: [] });
    expect(readAndClearNewLogins("cmp_1")).toEqual({ ok: true, created, skipped: [] });
    expect(sessionStorage.getItem("spark:newLogins:cmp_1")).toBeNull();
    expect(readAndClearNewLogins("cmp_1")).toBeNull();
  });

  it("keeps an error record", () => {
    saveNewLogins("cmp_1", { ok: false, error: "Setup didn't finish." });
    expect(readAndClearNewLogins("cmp_1")).toEqual({ ok: false, error: "Setup didn't finish." });
  });

  it("returns null for a corrupt or wrong-shaped record and still clears it", () => {
    sessionStorage.setItem("spark:newLogins:cmp_1", "{not json");
    expect(readAndClearNewLogins("cmp_1")).toBeNull();
    expect(sessionStorage.getItem("spark:newLogins:cmp_1")).toBeNull();
    sessionStorage.setItem("spark:newLogins:cmp_2", JSON.stringify({ hello: 1 }));
    expect(readAndClearNewLogins("cmp_2")).toBeNull();
  });

  it("clearAllSparkLoginKeys removes only the spark:newLogins keys", () => {
    saveNewLogins("cmp_1", { ok: false, error: "x" });
    saveNewLogins("cmp_2", { ok: false, error: "y" });
    sessionStorage.setItem("something:else", "keep");
    clearAllSparkLoginKeys();
    expect(sessionStorage.getItem("spark:newLogins:cmp_1")).toBeNull();
    expect(sessionStorage.getItem("spark:newLogins:cmp_2")).toBeNull();
    expect(sessionStorage.getItem("something:else")).toBe("keep");
  });

  it("never throws when storage is blocked", () => {
    const blocked = () => {
      throw new Error("blocked");
    };
    const setSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
    const getSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
    const removeSpy = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(blocked);
    const keySpy = vi.spyOn(Storage.prototype, "key").mockImplementation(blocked);
    expect(() => saveNewLogins("cmp_1", { ok: false, error: "x" })).not.toThrow();
    expect(readAndClearNewLogins("cmp_1")).toBeNull();
    expect(() => clearAllSparkLoginKeys()).not.toThrow();
    setSpy.mockRestore();
    getSpy.mockRestore();
    removeSpy.mockRestore();
    keySpy.mockRestore();
  });
});

describe("departmentColors", () => {
  it("keeps the onboarding colours and falls back to indigo", () => {
    expect(colorFor("fin")).toBe(DEPT_COLORS.FIN);
    expect(colorFor("FIN")).toBe("#3B82F6");
    expect(colorFor("UNKNOWN")).toBe("#4040C8");
  });
});

describe("isSparkPlaceholderEmail", () => {
  it("is true only for Spark's own @admin.com and @hod.com logins", () => {
    expect(isSparkPlaceholderEmail("acme@admin.com")).toBe(true);
    expect(isSparkPlaceholderEmail("acme-fin@hod.com")).toBe(true);
    // Same normalising as the backend: trimmed and lower-cased.
    expect(isSparkPlaceholderEmail("  ACME-FIN@HOD.COM ")).toBe(true);
  });

  it("is false for a real colleague's address and for junk", () => {
    expect(isSparkPlaceholderEmail("cfo@client.com")).toBe(false);
    expect(isSparkPlaceholderEmail("someone@sub.admin.com")).toBe(false);
    expect(isSparkPlaceholderEmail("a@b@admin.com")).toBe(false);
    expect(isSparkPlaceholderEmail("")).toBe(false);
    expect(isSparkPlaceholderEmail(null)).toBe(false);
  });
});
