// Who leads each department on a draft cycle.
//
// Spark staff run the cycles they submit, so the lead chip is them — on every
// row, including departments that already have a real lead, and ones that have
// nobody, which are a hard block for everyone else (both here and in
// cycle_service.assign_departments, which refuses a headless department).
//
// The chip is not decoration: the backend makes the same substitution from the
// caller's own identity, so what this renders is what gets stored on the
// session. `everyDepartmentHasLead` is exported and shared with the parent's
// Submit gate precisely so the badge and the button can't disagree.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Department } from "@/types/admin";

const { default: AssignDepartmentsSection } = await import(
  "@/pages/annual-report/AssignDepartmentsSection"
);
const { everyDepartmentHasLead } = await import("@/pages/annual-report/departmentLead");

const HR: Department = {
  id: "dep_hr",
  department_code: "HR",
  department_name: "Human Resources",
  hod_user_id: "usr_hod",
  hod_name: "Hr HOD",
  has_hod: true,
} as Department;

// Nobody heads this one — a fresh client company looks like this.
const FIN: Department = {
  id: "dep_fin",
  department_code: "FIN",
  department_name: "Finance",
  hod_user_id: null,
  hod_name: null,
  has_hod: false,
} as Department;

const DEPTS = [HR, FIN];
const ASSIGNED = DEPTS.map((d) => ({
  department_id: d.id,
  department_name: d.department_name,
  department_code: d.department_code,
}));

const renderSection = (selfLeadName: string | null) =>
  render(
    <AssignDepartmentsSection
      allDepartments={DEPTS}
      assigned={ASSIGNED}
      onAdd={() => {}}
      onRemove={() => {}}
      selfLeadName={selfLeadName}
    />,
  );

describe("Assign Departments — who leads", () => {
  it("names the Spark user on every row, replacing the client's lead", () => {
    renderSection("Spark Staff");

    expect(screen.getAllByText("Spark Staff (you)")).toHaveLength(2);
    // HR's own lead is not who runs this cycle.
    expect(screen.queryByText("Hr HOD")).not.toBeInTheDocument();
  });

  it("stops warning about departments with nobody in them", () => {
    // Finance has no lead, but it isn't missing anything any more.
    renderSection("Spark Staff");

    expect(screen.queryByText(/No FIN Lead assigned/)).not.toBeInTheDocument();
    expect(screen.queryByText(/set one in the admin console/)).not.toBeInTheDocument();
  });

  it("leaves a client admin's screen exactly as it was", () => {
    renderSection(null);

    expect(screen.getByText("Hr HOD")).toBeInTheDocument();
    expect(screen.queryByText(/\(you\)/)).not.toBeInTheDocument();
    // Finance still has to be fixed in the admin console before it can be used.
    expect(screen.getByText(/No FIN Lead assigned — set one in the admin console/))
      .toBeInTheDocument();
    expect(screen.getByText("⚠ No FIN Lead assigned")).toBeInTheDocument();
  });
});

describe("the Submit gate", () => {
  it("blocks a leaderless department for a client admin", () => {
    expect(everyDepartmentHasLead(ASSIGNED, DEPTS, null)).toBe(false);
    expect(everyDepartmentHasLead([ASSIGNED[0]], DEPTS, null)).toBe(true);
  });

  it("lets Spark through, because they are the lead", () => {
    expect(everyDepartmentHasLead(ASSIGNED, DEPTS, "Spark Staff")).toBe(true);
  });

  it("does not treat an unknown department as led", () => {
    // A row whose department dropped out of the list must not read as fine.
    const orphan = [{ department_id: "gone", department_name: "?", department_code: "X" }];
    expect(everyDepartmentHasLead(orphan, DEPTS, null)).toBe(false);
  });
});
