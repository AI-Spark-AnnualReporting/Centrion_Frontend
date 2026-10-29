// The "Cycle setup" panel on a draft cycle: three steps, the Submit cycle button,
// and the count of departments still missing a lead.
//
// What must hold:
//   - each step says what is done or what is missing, in plain words;
//   - Submit cycle is enabled only when the page says it can submit;
//   - clicking a step asks the page to scroll to that step's card;
//   - the lead count matches the rule Submit has always used (Spark leads all).

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CycleSetupPanel, { buildSetupSteps } from "@/pages/annual-report/CycleSetupPanel";
import { departmentsWithoutLead, everyDepartmentHasLead } from "@/pages/annual-report/departmentLead";
import type { Department } from "@/types/admin";

function renderPanel(props: Partial<React.ComponentProps<typeof CycleSetupPanel>> = {}) {
  const onSubmit = vi.fn();
  const onJump = vi.fn();
  render(
    <CycleSetupPanel
      outlineChosen={false}
      departmentCount={0}
      withoutLead={0}
      canSubmit={false}
      submitting={false}
      building={false}
      message=""
      error=""
      onSubmit={onSubmit}
      onJump={onJump}
      {...props}
    />,
  );
  return { onSubmit, onJump };
}

describe("buildSetupSteps", () => {
  it("says what is missing on a fresh cycle", () => {
    const steps = buildSetupSteps(false, 0, 0);
    expect(steps.map((s) => [s.done, s.detail])).toEqual([
      [false, "Add at least one department"],
      [false, "Every department needs a lead"],
      [false, "Select an outline"],
    ]);
  });

  it("counts departments and the ones without a lead", () => {
    const steps = buildSetupSteps(true, 2, 1);
    expect(steps.map((s) => [s.done, s.detail])).toEqual([
      [true, "2 departments added"],
      [false, "1 without a lead"],
      [true, "Outline selected"],
    ]);
  });

  it("lists the steps in page order, with the outline last", () => {
    const titles = buildSetupSteps(false, 0, 0).map((s) => s.title);
    expect(titles).toEqual(["Add departments", "Give each a lead", "Choose the outline"]);
  });

  it("is all done when every department has a lead", () => {
    expect(buildSetupSteps(true, 1, 0).every((s) => s.done)).toBe(true);
  });
});

describe("CycleSetupPanel", () => {
  it("keeps Submit cycle disabled and says how many steps are left", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: /Submit cycle/ })).toBeDisabled();
    expect(screen.getByText("3 of 3 steps left")).toBeInTheDocument();
  });

  it("submits once the page says it can", () => {
    const { onSubmit } = renderPanel({ outlineChosen: true, departmentCount: 1, canSubmit: true });
    const button = screen.getByRole("button", { name: /Submit cycle/ });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/The cycle stays in draft/)).toBeInTheDocument();
  });

  it("stays disabled while the sections are being built", () => {
    renderPanel({ outlineChosen: true, departmentCount: 1, canSubmit: true, building: true });
    expect(screen.getByRole("button", { name: /Submit cycle/ })).toBeDisabled();
    expect(screen.getByText(/Building sections… Submit is available when it's done./)).toBeInTheDocument();
  });

  it("jumps to the card of the step that was clicked", () => {
    const { onJump } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Choose the outline/ }));
    fireEvent.click(screen.getByRole("button", { name: /Give each a lead/ }));
    expect(onJump.mock.calls).toEqual([["outline"], ["departments"]]);
  });

  it("shows the result of a submit in place of the hint", () => {
    renderPanel({ error: "This cycle is no longer in draft." });
    expect(screen.getByRole("alert")).toHaveTextContent("This cycle is no longer in draft.");
    expect(screen.queryByText(/steps left/)).not.toBeInTheDocument();
  });
});

describe("departmentsWithoutLead", () => {
  const departments = [
    { id: "d1", has_hod: true },
    { id: "d2", has_hod: false },
    { id: "d3", hod_user_id: "u9" },
  ] as Department[];
  const assigned = [
    { department_id: "d1", department_name: "Finance", department_code: "FIN" },
    { department_id: "d2", department_name: "HR", department_code: "HR" },
    { department_id: "d3", department_name: "ESG", department_code: "ESG" },
  ];

  it("counts the departments with no lead, and agrees with everyDepartmentHasLead", () => {
    expect(departmentsWithoutLead(assigned, departments)).toBe(1);
    expect(everyDepartmentHasLead(assigned, departments)).toBe(false);
  });

  it("is 0 when the caller leads every department (Spark)", () => {
    expect(departmentsWithoutLead(assigned, departments, "Spark")).toBe(0);
    expect(everyDepartmentHasLead(assigned, departments, "Spark")).toBe(true);
  });
});
