// Two rules can both arrive as status "no_data" and mean opposite things: a
// filing outside the report answers it (nobody's gap, unscored) or our own
// validator returned no verdict (ours, scored against us, a re-run may clear
// it). Worth a test because the failure is silent and it tells the user a
// validator outage is paperwork they need to go find.

import { describe, it, expect } from "vitest";
import type { RuleDetailGroup } from "@/types/compliance";
import { groupCounts, statusHint, statusLabel } from "@/pages/compliance/compliance-ui";

// Run 5c24bd89's CMA group: 3 HARD passes, 2 SOFT rules answered by filing
// records that no version of the report could ever satisfy.
const GROUP: RuleDetailGroup = {
  regulator: "CMA",
  rules: [
    { rule_id: "CMA-FS-Q-EXIST", status: "pass", gate: "HARD" },
    { rule_id: "CMA-FS-Q-REVIEW", status: "pass", gate: "HARD" },
    { rule_id: "CMA-FS-Q-BASIS", status: "pass", gate: "HARD" },
    { rule_id: "CMA-FS-Q-TIMING", status: "no_data", gate: "SOFT", unreachable: true },
    { rule_id: "CMA-FS-Q-EFSAH", status: "no_data", gate: "SOFT", unreachable: true },
  ],
};

describe("the two kinds of no_data", () => {
  it("keeps unreachable rules out of the denominator", () => {
    const c = groupCounts(GROUP);
    // 3 of 3, not 3 of 5 — the old count is what capped a flawless report at 71.
    expect(c.checkable).toBe(3);
    expect(c.passed).toBe(3);
    expect(c.unreachable).toBe(2);
    expect(c.noData).toBe(0);
  });

  it("counts a validator miss against the score but not an unreachable rule", () => {
    const c = groupCounts({
      regulator: "CMA",
      rules: [
        { rule_id: "A", status: "pass", gate: "HARD" },
        { rule_id: "B", status: "no_data", gate: "SOFT", unreachable: true },
        { rule_id: "C", status: "no_data", gate: "SOFT", unreachable: false },
        { rule_id: "D", status: "na", gate: "SOFT" },
      ],
    });
    // pass + no_data(false). na and unreachable both sit outside.
    expect(c.checkable).toBe(2);
    expect(c.unreachable).toBe(1);
    expect(c.noData).toBe(1);
    expect(c.na).toBe(1);
  });

  it("labels them differently — the same status must not read the same", () => {
    expect(statusLabel("no_data", undefined, true)).toBe("Answered elsewhere");
    expect(statusLabel("no_data", undefined, false)).toBe("Couldn’t check");
    // A missing flag must not be described as someone else's filing.
    expect(statusLabel("no_data")).toBe("Couldn’t check");
    expect(statusHint("no_data", undefined, true)).toMatch(/outside this report/);
    expect(statusHint("no_data", undefined, false)).toMatch(/Re-validate/);
  });
});
