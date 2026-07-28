// The rule-detail rows arrive with their evidence FLAT (`quote`, `proof`,
// `page`, … as siblings of `rule_id`) while gaps nest theirs under `evidence`.
// `normalizeRun` folds the flat form into `evidence` so the renderers only ever
// see one shape — and a regression there is invisible rather than loud: the
// quotes simply stop appearing on screen. Hence this test.
//
// The payload below is a real GET /runs/{id} response, kept verbatim.

import { describe, it, expect, vi, afterEach } from "vitest";
import { complianceValidation } from "@/lib/api";

const RUN = {
  run_id: "5c24bd89-10bd-4762-b67f-0709ec691467",
  subject_type: "document",
  subject_id: "671c7abd-014f-43e5-b26e-e59a12fb3682",
  report_type: "quarterly",
  status: "done",
  certified: false,
  overall_readiness: 100,
  publication_gate: "open",
  frameworks: [{ regulator: "CMA", score: 100, passed: 3, total: 3, no_data: 2 }],
  gaps: [],
  rule_detail: [
    {
      regulator: "CMA",
      rules: [
        {
          rule_id: "CMA-FS-Q-EXIST",
          status: "pass",
          gate: "HARD",
          evidence_source: "Report document",
          page: 1,
          source_file: null,
          section_code: "page-1",
          quote:
            "UNAUDITED INTERIM CONDENSED CONSOLIDATED FINANCIAL STATEMENTS FOR THE THREE MONTH PERIOD ENDED MARCH 31, 2025",
          proof:
            "This quote establishes the requirement because it confirms the existence of interim financial statements for the reporting quarter under review.",
        },
        {
          rule_id: "CMA-FS-Q-TIMING",
          status: "no_data",
          gate: "SOFT",
          evidence_source: "Filing metadata (report_filings)",
          page: null,
          source_file: null,
          section_code: null,
          quote: null,
          proof: null,
        },
      ],
    },
  ],
};

function mockFetch(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => body,
    })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("normalizeRun — rule-detail evidence", () => {
  it("folds the flat wire fields into `evidence`", async () => {
    mockFetch(RUN);
    const run = await complianceValidation.getRun(RUN.run_id);
    const rule = run.rule_detail[0].rules[0];

    expect(rule.evidence).toMatchObject({
      quote:
        "UNAUDITED INTERIM CONDENSED CONSOLIDATED FINANCIAL STATEMENTS FOR THE THREE MONTH PERIOD ENDED MARCH 31, 2025",
      section_code: "page-1",
      page: 1,
      evidence_source: "Report document",
    });
    expect(rule.evidence?.proof).toContain("confirms the existence of interim financial statements");
    // A null `source_file` is dropped rather than carried through as null, so
    // the renderer's truthiness checks stay honest.
    expect(rule.evidence).not.toHaveProperty("source_file");
  });

  it("keeps a no_data row's source without inventing a quote", async () => {
    mockFetch(RUN);
    const run = await complianceValidation.getRun(RUN.run_id);
    const rule = run.rule_detail[0].rules[1];

    expect(rule.evidence?.evidence_source).toBe("Filing metadata (report_filings)");
    expect(rule.evidence?.quote).toBeUndefined();
    // No page to point at — the answer lives outside this report.
    expect(rule.evidence?.page).toBeUndefined();
  });

  it("leaves an already-nested `evidence` alone", async () => {
    // The richer shape carries found/missing/confidence, which the flat fields
    // have no room for — flattening it back down would lose them.
    mockFetch({
      ...RUN,
      rule_detail: [
        {
          regulator: "CMA",
          rules: [
            {
              rule_id: "CMA-X",
              status: "fail",
              gate: "HARD",
              evidence: { quote: "nested", confidence: 0.9, missing: ["dividend policy"] },
              quote: "flat should not win",
            },
          ],
        },
      ],
    });
    const run = await complianceValidation.getRun(RUN.run_id);
    const rule = run.rule_detail[0].rules[0];

    expect(rule.evidence?.quote).toBe("nested");
    expect(rule.evidence?.confidence).toBe(0.9);
    expect(rule.evidence?.missing).toEqual(["dividend policy"]);
  });
});
