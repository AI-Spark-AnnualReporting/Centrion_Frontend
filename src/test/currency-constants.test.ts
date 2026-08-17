// Guards the shared currency/scale constants against the drift that already bit
// this codebase once: the dashboard's own scale map was missing keys the API
// emits, so those values silently fell through to a multiplier of 1.

import { describe, it, expect } from "vitest";
import {
  REPORTING_CURRENCIES,
  FINANCIAL_SCALES,
  SCALE_FACTOR,
  DEFAULT_CURRENCY,
  isFinancialScale,
  isKnownCurrency,
  normaliseCurrencyCode,
} from "@/constants/currency";

describe("currency constants", () => {
  it("has unique, upper-case ISO codes", () => {
    const codes = REPORTING_CURRENCIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toBe(code.toUpperCase());
  });

  it("includes the default currency", () => {
    expect(isKnownCurrency(DEFAULT_CURRENCY)).toBe(true);
  });

  it("maps every scale option to a multiplier", () => {
    for (const s of FINANCIAL_SCALES) {
      expect(SCALE_FACTOR[s.value], `missing multiplier for ${s.value}`).toBeGreaterThan(0);
    }
  });

  it("resolves the API's 'actual' token, which the dashboard map omits", () => {
    expect(SCALE_FACTOR.actual).toBe(1);
    expect(SCALE_FACTOR.units).toBe(1);
  });

  it("treats singular and plural scale spellings identically", () => {
    expect(SCALE_FACTOR.million).toBe(SCALE_FACTOR.millions);
    expect(SCALE_FACTOR.billion).toBe(SCALE_FACTOR.billions);
    expect(SCALE_FACTOR.thousand).toBe(SCALE_FACTOR.thousands);
  });

  it("recognises only the API's scale tokens", () => {
    expect(isFinancialScale("millions")).toBe(true);
    expect(isFinancialScale("million")).toBe(false); // parser token, not an API one
    expect(isFinancialScale("")).toBe(false);
    expect(isFinancialScale(null)).toBe(false);
  });

  it("normalises currency codes and rejects the backend's UNKNOWN sentinel", () => {
    expect(normaliseCurrencyCode(" sar ")).toBe("SAR");
    expect(normaliseCurrencyCode("UNKNOWN")).toBeNull();
    expect(normaliseCurrencyCode("")).toBeNull();
    expect(normaliseCurrencyCode(null)).toBeNull();
  });

  it("passes through a currency that is off the list rather than guessing", () => {
    // A company reporting in JPY must not be silently switched to SAR.
    expect(normaliseCurrencyCode("jpy")).toBe("JPY");
    expect(isKnownCurrency("JPY")).toBe(false);
  });
});
