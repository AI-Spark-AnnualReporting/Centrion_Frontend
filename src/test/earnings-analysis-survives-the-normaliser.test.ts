// The analysis reaches React, against the REAL @/lib/api module.
//
// This is a one-line-of-production-code test, and it exists because that one line
// was missing for the entire life of the feature. normalizeEarningsSection builds
// its object field by field, so a field nobody lists is silently dropped — and
// `analysis` was not listed. The backend selected it, sent it, and the exporters
// rendered it in the PDF, so every other layer looked correct; it disappeared in
// the six lines between `fetch` and `setState`.
//
// Two screens were wrong as a result. The Report screen never showed an analysis
// at all. Preview looked fine only because clicking Analyse writes the result
// into local state — reload the page and the bullets were gone, and clicking
// Analyse again returned instantly from the server-side cache, which made the
// bug look like it had never happened.
//
// Quarterly hit exactly this, in exactly this way, in AssembledReportPage.

import { describe, it, expect, vi, afterEach } from "vitest";
import { earnings } from "@/lib/api";

const ANALYSIS = {
  text: "- Revenue of SAR 416,628M is the largest line in the table.",
  generated_at: "2026-08-24T08:18:10Z",
  model: "gpt-4.1",
  fingerprint: "fp-1",
  warnings: [],
  line_count: 3,
  edited: false,
  edited_at: null,
};

function stubFetch(sections: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ report_id: "rep-1", sections }),
      text: async () => "",
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("getEarningsSections", () => {
  it("carries a section's analysis through to the caller", async () => {
    stubFetch([
      { section_code: "s12_consensus", title: "Consensus vs Actual", mode: "table",
        status: "produced", content: "{}", analysis: ANALYSIS },
    ]);

    const res = await earnings.getEarningsSections("rep-1");

    expect(res.sections[0].analysis?.text).toContain("largest line in the table");
  });

  it("is null, not undefined-by-omission, for a section never analysed", async () => {
    stubFetch([
      { section_code: "s03_exec_summary", title: "Executive Summary",
        mode: "generate", status: "produced", content: "Prose." },
    ]);

    const res = await earnings.getEarningsSections("rep-1");

    expect(res.sections[0].analysis).toBeNull();
  });

  it("refuses a malformed analysis rather than handing it to a renderer", async () => {
    // The column is jsonb and nothing constrains its shape, so a string or an
    // array reaching `analysis.text` would be a runtime crash on a finished report.
    stubFetch([
      { section_code: "a", title: "A", mode: "generate", status: "produced",
        content: "x", analysis: "just a string" },
      { section_code: "b", title: "B", mode: "generate", status: "produced",
        content: "x", analysis: ["bullet"] },
    ]);

    const res = await earnings.getEarningsSections("rep-1");

    expect(res.sections[0].analysis).toBeNull();
    expect(res.sections[1].analysis).toBeNull();
  });
});
