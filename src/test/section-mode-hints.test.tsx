// Annual outline section tags explain themselves (feedback F15: "The tags Auto,
// Manual, Generate and Analyze have no explanation on screen").

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SectionModeBadge, SectionModeLegend } from "@/pages/annual-report/cycle-ui";
import type { SectionMode } from "@/types/cycles";

const MEANINGS: [SectionMode, string, RegExp][] = [
  ["generate", "Generate", /AI writes it from the departments' answers\./],
  ["attach", "Attach", /You upload a document; it goes in as-is\./],
  ["auto", "Auto", /Built automatically, e\.g\. the cover and contents\./],
  ["manual", "Manual", /You write or paste it yourself\./],
  ["extract", "Extract", /AI pulls the content from a document you upload\./],
  ["analyze", "Analyze", /AI draws findings from all the departments' inputs\./],
];

describe("the legend above the outline", () => {
  it("lists every tag with its one-line meaning, in filter order", () => {
    render(<SectionModeLegend />);
    const legend = screen.getByLabelText("What the section tags mean");
    const labels = Array.from(legend.querySelectorAll(".badge")).map((b) => b.textContent);
    expect(labels).toEqual(MEANINGS.map(([, label]) => label));
    for (const [, , meaning] of MEANINGS) {
      expect(screen.getByText(meaning)).toBeInTheDocument();
    }
  });
});

describe("a section's tag", () => {
  it.each(MEANINGS)("%s shows its meaning when focused or pointed at", async (mode, label, meaning) => {
    render(<SectionModeBadge mode={mode} />);
    expect(screen.queryByText(meaning)).not.toBeInTheDocument();
    fireEvent.focus(screen.getByText(label));
    expect((await screen.findAllByText(meaning)).length).toBeGreaterThan(0);
  });

  it("falls back to Auto for a mode it doesn't know", () => {
    render(<SectionModeBadge mode={"something_new" as SectionMode} />);
    expect(screen.getByText("Auto")).toBeInTheDocument();
  });
});
