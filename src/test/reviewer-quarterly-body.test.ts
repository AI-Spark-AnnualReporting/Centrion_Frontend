// The reviewer view renders quarterly section bodies through SectionRenderer,
// which was built for the earnings shape and calls `content.trim()`. But
// /assemble may hand table content back ALREADY PARSED (an object/array, not a
// JSON string) — see toProduced in AssembledReportPage. If assembledToProduced
// stops stringifying, the reviewer screen throws on the first table section
// instead of failing quietly. Hence this test.

import { describe, it, expect } from "vitest";
import { assembledToProduced } from "@/components/communications/ReviewerView";
import type { AssembledSection } from "@/types/quarterly";

// Cast: the real payload violates the declared `content: string | null`, which
// is the whole reason the normalisation exists.
const section = (content: unknown): AssembledSection =>
  ({ section_code: "s04_financials", title: "Financials", display_order: 4, mode: "table", content }) as AssembledSection;

describe("assembledToProduced", () => {
  it("stringifies content that arrives already parsed", () => {
    const rows = [{ label: "Revenue", value: "1.2bn" }];
    const out = assembledToProduced(section(rows));
    expect(typeof out.content).toBe("string");
    expect(JSON.parse(out.content!)).toEqual(rows);
  });

  it("leaves string content untouched", () => {
    expect(assembledToProduced(section("Revenue rose 12%.")).content).toBe("Revenue rose 12%.");
  });

  it("keeps null null rather than the string 'null'", () => {
    expect(assembledToProduced(section(null)).content).toBeNull();
  });

  it("carries the code/title/mode SectionRenderer dispatches on", () => {
    const out = assembledToProduced(section("x"));
    expect(out).toMatchObject({ section_code: "s04_financials", title: "Financials", mode: "table" });
    // 'produced' — not 'pending', which would make the renderer claim the
    // section is still generating.
    expect(out.status).toBe("produced");
  });
});
