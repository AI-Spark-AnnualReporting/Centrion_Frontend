// The Select-outline popup on the cycle page, and the chapter grouping it shares with
// the Previous list.
//
// What must hold:
//   - the highlighted option is obvious (aria-checked) and the one in use is marked;
//   - nothing is applied until the Use button, and its words say what it will do;
//   - Previous is unavailable when the uploaded report had no contents page;
//   - the popup lists every section of the highlighted option, Previous grouped
//     under the report's own chapters with extras in "Added for this report".

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReportOutlineDetail } from "@/types/company";

const outlinePreview = vi.fn();
vi.mock("@/lib/api", () => ({
  sarCycles: { outlinePreview: (...args: unknown[]) => outlinePreview(...args) },
}));

const { default: SelectOutlineModal, useButtonLabel } = await import(
  "@/pages/annual-report/SelectOutlineModal"
);
const { groupByChapter, firstNumbers, ADDED_FOR_THIS_REPORT, PreviousOutline } = await import(
  "@/pages/annual-report/PreviousOutline"
);

// Aramex-shaped contents page: two chapters, a level-3 line, sections with codes.
const DETAIL: ReportOutlineDetail = {
  found: true,
  entries: [
    { title: "Introduction", level: 1 },
    { title: "Chairman Letter", level: 2, section_code: "chairman_letter" },
    { title: "CEO Letter", level: 2, section_code: "ceo_letter" },
    { title: "Social", level: 1 },
    { title: "Our People", level: 2, section_code: "our_people" },
  ],
};

const PREVIOUS_SECTIONS = [
  { section_code: "theme_rationale", title: "Theme Rationale", layer: "", mode: "generate" },
  { section_code: "chairman_letter", title: "Chairman Letter", layer: "", mode: "manual" },
  { section_code: "ceo_letter", title: "CEO Letter", layer: "", mode: "manual" },
  { section_code: "our_people", title: "Our People", layer: "", mode: "generate" },
];
const SYSTEM_SECTIONS = [
  { section_code: "toc", title: "Table of Contents", layer: "common", mode: "auto" },
  { section_code: "treasury", title: "Treasury Shares", layer: "cma", mode: "extract" },
];

function answerPreviews() {
  outlinePreview.mockImplementation((_id: string, source: string) =>
    Promise.resolve({
      cycle_id: "cyc_1",
      source,
      effective_source: source,
      sections: source === "previous" ? PREVIOUS_SECTIONS : SYSTEM_SECTIONS,
    }),
  );
}

function renderModal(props: Partial<React.ComponentProps<typeof SelectOutlineModal>> = {}) {
  const onUse = vi.fn();
  const onClose = vi.fn();
  render(
    <SelectOutlineModal
      cycleId="cyc_1"
      current={null}
      currentCount={0}
      previousDetail={DETAIL}
      onClose={onClose}
      onUse={onUse}
      {...props}
    />,
  );
  return { onUse, onClose };
}

beforeEach(() => {
  outlinePreview.mockReset();
  answerPreviews();
});

describe("groupByChapter", () => {
  it("puts sections under their chapters and extras in a last group", () => {
    const groups = groupByChapter(PREVIOUS_SECTIONS, DETAIL);
    expect(groups.map((g) => [g.title, g.items.length])).toEqual([
      ["Introduction", 2],
      ["Social", 1],
      [ADDED_FOR_THIS_REPORT, 1],
    ]);
  });

  it("is one flat untitled group when the contents page has no chapters", () => {
    const groups = groupByChapter(PREVIOUS_SECTIONS, { found: true, entries: [] });
    expect(groups).toEqual([{ title: null, items: PREVIOUS_SECTIONS }]);
  });

  it("numbers sections straight through the chapters", () => {
    expect(firstNumbers(groupByChapter(PREVIOUS_SECTIONS, DETAIL))).toEqual([1, 3, 4]);
  });
});

describe("PreviousOutline", () => {
  const sections = [
    { section_code: "chairman_letter", title: "Chairman Letter", layer: "common", mode: "manual", status: "pending" },
    { section_code: "ceo_letter", title: "CEO Letter", layer: "common", mode: "manual", status: "pending" },
    { section_code: "our_people", title: "Our People", layer: "common", mode: "generate", status: "pending" },
  ] as never[];

  it("starts open, folds a chapter and keeps the other chapters' numbers", () => {
    render(<PreviousOutline sections={sections} detail={DETAIL} loading={false} error="" onRetry={() => {}} />);
    const introduction = screen.getByRole("button", { name: /Introduction/ });
    expect(introduction).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(introduction);
    expect(screen.queryByText("Chairman Letter")).not.toBeInTheDocument();
    expect(screen.getByText("Our People").closest("tr")).toHaveTextContent("3");

    fireEvent.click(introduction);
    expect(screen.getByText("Chairman Letter")).toBeInTheDocument();
  });
});

describe("useButtonLabel", () => {
  it("says what the button will do", () => {
    expect(useButtonLabel(null, null)).toBe("Use this outline");
    expect(useButtonLabel("system", null)).toBe("Use System outline");
    expect(useButtonLabel("system", "previous")).toBe("Use System outline");
    expect(useButtonLabel("previous", "previous")).toBe("Rebuild Previous outline");
  });
});

describe("SelectOutlineModal", () => {
  it("starts with nothing highlighted and Use disabled when nothing is chosen yet", async () => {
    renderModal();
    expect(screen.getByRole("radio", { name: /Previous/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: /System/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: "Use this outline" })).toBeDisabled();
    expect(screen.getByText(/Pick an option above/)).toBeInTheDocument();
  });

  it("highlights a picked option and lists every one of its sections", async () => {
    const { onUse } = renderModal();
    fireEvent.click(screen.getByRole("radio", { name: /System/ }));

    expect(screen.getByRole("radio", { name: /System/ })).toHaveAttribute("aria-checked", "true");
    expect(await screen.findByText("Treasury Shares")).toBeInTheDocument();
    expect(screen.getByText("Table of Contents")).toBeInTheDocument();
    expect(onUse).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Use System outline" }));
    expect(onUse).toHaveBeenCalledWith("system");
  });

  it("groups the Previous list under the report's own chapters", async () => {
    renderModal();
    fireEvent.click(screen.getByRole("radio", { name: /Previous/ }));

    expect(await screen.findByText("Chairman Letter")).toBeInTheDocument();
    expect(screen.getByText("Introduction")).toBeInTheDocument();
    expect(screen.getByText("Social")).toBeInTheDocument();
    expect(screen.getByText(ADDED_FOR_THIS_REPORT)).toBeInTheDocument();
    expect(await screen.findByText("4 sections · 3 groups")).toBeInTheDocument();
  });

  it("marks the outline in use and offers to rebuild it", async () => {
    renderModal({ current: "previous", currentCount: 4 });
    expect(screen.getByRole("radio", { name: /Previous/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("IN USE NOW")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rebuild Previous outline" })).toBeEnabled();
  });

  it("warns that switching replaces the current sections", async () => {
    renderModal({ current: "previous", currentCount: 4 });
    fireEvent.click(screen.getByRole("radio", { name: /System/ }));
    expect(await screen.findByText(/This replaces the current 4 sections with 2/)).toBeInTheDocument();
  });

  it("makes Previous unavailable when the report had no contents page", () => {
    renderModal({ previousDetail: { found: false } });
    expect(screen.getByRole("radio", { name: /Previous/ })).toBeDisabled();
    expect(screen.getByText(/No contents page was found/)).toBeInTheDocument();
    expect(outlinePreview).toHaveBeenCalledTimes(1);
    expect(outlinePreview).toHaveBeenCalledWith("cyc_1", "system");
  });

  it("shows the error with a Retry that loads the list again", async () => {
    outlinePreview.mockRejectedValueOnce(new Error("The system is temporarily unavailable."));
    renderModal({ previousDetail: { found: false } });
    fireEvent.click(screen.getByRole("radio", { name: /System/ }));

    expect(await screen.findByText("The system is temporarily unavailable.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Treasury Shares")).toBeInTheDocument();
  });

  it("folds and reopens a chapter in the popup", async () => {
    renderModal();
    fireEvent.click(screen.getByRole("radio", { name: /Previous/ }));
    const introduction = await screen.findByRole("button", { name: /Introduction/ });

    expect(introduction).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(introduction);
    expect(introduction).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Chairman Letter")).not.toBeInTheDocument();
    expect(screen.getByText("Our People")).toBeInTheDocument();

    fireEvent.click(introduction);
    expect(screen.getByText("Chairman Letter")).toBeInTheDocument();
  });

  it("closes on Escape and on Cancel", () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
