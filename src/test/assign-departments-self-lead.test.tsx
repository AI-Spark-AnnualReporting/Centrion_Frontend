// Who leads each department on a draft cycle.
//
// Spark staff run cycles for a client. A department's real lead heads its
// session by default, and Spark can pick "(you)" instead, per new row. A
// department with nobody in charge falls back to Spark, calmly: for Spark that
// isn't a problem, so it is not shown as a warning. For everyone else a
// headless department is still a hard block (both here and in
// cycle_service.assign_departments, which refuses one).
//
// A department already saved on the cycle shows the lead stored on its session,
// locked: the backend never rewrites a saved session, so a live picker there
// would promise a change that never happens.
//
// The chip is not decoration: the page sends the same choice as `lead`, so what
// this renders is what gets stored. `everyDepartmentHasLead` is shared with the
// parent's Submit gate so the badge and the button can't disagree.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import type { Department } from "@/types/admin";
import type {
  DepartmentAssignment,
  SavedDepartmentLead,
} from "@/pages/annual-report/AssignDepartmentsSection";

const { default: AssignDepartmentsSection } = await import(
  "@/pages/annual-report/AssignDepartmentsSection"
);
const { everyDepartmentHasLead, sparkLeadChoice } = await import(
  "@/pages/annual-report/departmentLead"
);

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

// Already saved on the cycle; its session is headed by someone else now.
const ESG: Department = {
  id: "dep_esg",
  department_code: "ESG",
  department_name: "Sustainability",
  hod_user_id: "usr_esg",
  hod_name: "Esg Lead",
  has_hod: true,
} as Department;

const DEPTS = [HR, FIN];

// Rows as the page builds them when the departments are added.
const ASSIGNED: DepartmentAssignment[] = [
  { department_id: HR.id, department_name: HR.department_name, department_code: "HR", lead: "department" },
  { department_id: FIN.id, department_name: FIN.department_name, department_code: "FIN", lead: "self" },
];

/** Renders the section the way the page does for a Spark user, with live lead state. */
function SparkHarness({
  rows,
  departments = DEPTS,
  savedLeads,
  onLeadChange,
}: {
  rows: DepartmentAssignment[];
  departments?: Department[];
  savedLeads?: Map<string, SavedDepartmentLead>;
  onLeadChange?: (id: string, lead: "department" | "self") => void;
}) {
  const [assigned, setAssigned] = useState(rows);
  return (
    <AssignDepartmentsSection
      allDepartments={departments}
      assigned={assigned}
      onAdd={() => {}}
      onRemove={() => {}}
      selfLeadName="Spark Staff"
      isSpark
      savedLeads={savedLeads}
      onLeadChange={(id, lead) => {
        onLeadChange?.(id, lead);
        setAssigned((prev) => prev.map((a) => (a.department_id === id ? { ...a, lead } : a)));
      }}
    />
  );
}

/** The client admin's screen: no Spark props at all, exactly as the page passes them. */
const renderForAdmin = () =>
  render(
    <AssignDepartmentsSection
      allDepartments={DEPTS}
      assigned={ASSIGNED}
      onAdd={() => {}}
      onRemove={() => {}}
      selfLeadName={null}
      isSpark={false}
    />,
  );

describe("Assign Departments — department colours and test hooks", () => {
  it("gives Spark the shared department colour on the code tile, and a stable picker hook", () => {
    render(<SparkHarness rows={ASSIGNED} />);
    // HR is amber (#F59E0B) in the shared map, the same as in the wizard.
    expect(screen.getByText("HR", { selector: "span" }).style.background).toBe("rgb(245, 158, 11)");
    expect(screen.getByTestId("lead-picker-HR")).toBe(
      screen.getByRole("combobox", { name: "Who leads Human Resources" }),
    );
  });

  it("keeps the plain indigo tile for a client admin", () => {
    renderForAdmin();
    expect(screen.getByText("HR", { selector: "span" }).style.background).toBe("rgb(64, 64, 200)");
  });
});

describe("Assign Departments — who leads, for Spark", () => {
  it("defaults a department with a real lead to that lead, in a picker", () => {
    render(<SparkHarness rows={ASSIGNED} />);

    const picker = screen.getByRole("combobox", { name: "Who leads Human Resources" }) as HTMLSelectElement;
    expect(picker.value).toBe("department");
    expect(picker.className).toBe("inp sel");
    expect(screen.getByRole("option", { name: "Hr HOD, HR Lead" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Spark Staff (you)" })).toBeInTheDocument();
    // The sub-line names the lead's role while the real lead is chosen.
    expect(screen.getByText("HR Lead")).toBeInTheDocument();
  });

  it("shows Spark on a department with no lead, without a picker", () => {
    render(<SparkHarness rows={ASSIGNED} />);

    expect(screen.queryByRole("combobox", { name: "Who leads Finance" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Led by Spark Staff (you)")).toHaveTextContent("Spark Staff (you)");
    expect(screen.getByText("No FIN Lead yet, so you'll lead it.")).toBeInTheDocument();
  });

  it("switches HR to Spark when '(you)' is picked, and says so on the row", () => {
    const onLeadChange = vi.fn();
    render(<SparkHarness rows={ASSIGNED} onLeadChange={onLeadChange} />);

    const picker = screen.getByRole("combobox", { name: "Who leads Human Resources" }) as HTMLSelectElement;
    fireEvent.change(picker, { target: { value: "self" } });

    expect(onLeadChange).toHaveBeenCalledWith("dep_hr", "self");
    expect(picker.value).toBe("self");
    expect(picker).toHaveAttribute("title", "Spark Staff (you)");
    expect(screen.getByText("You lead this department")).toBeInTheDocument();
    expect(screen.queryByText("HR Lead")).not.toBeInTheDocument();
  });

  it("stops warning about departments with nobody in them", () => {
    // Finance has no lead, but it isn't missing anything any more.
    render(<SparkHarness rows={ASSIGNED} />);

    expect(screen.queryByText(/No FIN Lead assigned/)).not.toBeInTheDocument();
    expect(screen.queryByText(/set one in the admin console/)).not.toBeInTheDocument();
  });

  it("locks a saved row on the lead stored on its session", () => {
    const saved = new Map<string, SavedDepartmentLead>([
      ["dep_esg", { name: "Omar Ali", isYou: false }],
    ]);
    const rows: DepartmentAssignment[] = [
      { department_id: ESG.id, department_name: ESG.department_name, department_code: "ESG" },
    ];
    render(<SparkHarness rows={rows} departments={[ESG]} savedLeads={saved} />);

    // Saved session lead, not the department's current lead, and no picker.
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    const chip = screen.getByLabelText("Led by Omar Ali, saved");
    expect(chip).toHaveTextContent("Omar Ali");
    expect(chip).toHaveAttribute("title", "Already saved. The lead can't be changed on this cycle.");
    expect(screen.queryByText(/Esg Lead/)).not.toBeInTheDocument();
    expect(screen.getByText("Saved on this cycle")).toBeInTheDocument();
  });

  it("names Spark on a saved row Spark itself heads", () => {
    const saved = new Map<string, SavedDepartmentLead>([["dep_esg", { name: "Spark Staff", isYou: true }]]);
    const rows: DepartmentAssignment[] = [
      { department_id: ESG.id, department_name: ESG.department_name, department_code: "ESG" },
    ];
    render(<SparkHarness rows={rows} departments={[ESG]} savedLeads={saved} />);

    expect(screen.getByLabelText("Led by Spark Staff (you), saved")).toBeInTheDocument();
  });
});

describe("Assign Departments — who leads, for a client admin", () => {
  it("leaves a client admin's screen exactly as it was", () => {
    renderForAdmin();

    expect(screen.getByText("Hr HOD")).toBeInTheDocument();
    expect(screen.queryByText(/\(you\)/)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    // Finance still has to be fixed in the admin console before it can be used.
    expect(screen.getByText(/No FIN Lead assigned — set one in the admin console/))
      .toBeInTheDocument();
    expect(screen.getByText("⚠ No FIN Lead assigned")).toBeInTheDocument();
  });

  it("ignores saved leads it is somehow handed", () => {
    // Only Spark's screen reads them; a client admin's rows stay as today.
    render(
      <AssignDepartmentsSection
        allDepartments={DEPTS}
        assigned={ASSIGNED}
        onAdd={() => {}}
        onRemove={() => {}}
        selfLeadName={null}
        isSpark={false}
        savedLeads={new Map([["dep_hr", { name: "Someone Else", isYou: false }]])}
      />,
    );

    expect(screen.getByText("Hr HOD")).toBeInTheDocument();
    expect(screen.queryByText("Someone Else")).not.toBeInTheDocument();
  });
});

describe("the lead choice sent for Spark", () => {
  it("is the real lead by default, '(you)' when picked, and Spark when nobody leads", () => {
    const hrRow = ASSIGNED[0];
    expect(sparkLeadChoice({ ...hrRow, lead: undefined }, HR)).toBe("department");
    expect(sparkLeadChoice(hrRow, HR)).toBe("department");
    expect(sparkLeadChoice({ ...hrRow, lead: "self" }, HR)).toBe("self");
    // A stale 'department' on a lead-less department can't send a missing lead.
    expect(sparkLeadChoice({ ...ASSIGNED[1], lead: "department" }, FIN)).toBe("self");
    expect(sparkLeadChoice(ASSIGNED[1], undefined)).toBe("self");
  });
});

describe("the Submit gate", () => {
  it("blocks a leaderless department for a client admin", () => {
    expect(everyDepartmentHasLead(ASSIGNED, DEPTS, null)).toBe(false);
    expect(everyDepartmentHasLead([ASSIGNED[0]], DEPTS, null)).toBe(true);
  });

  it("lets Spark through, because Spark is the fallback lead", () => {
    expect(everyDepartmentHasLead(ASSIGNED, DEPTS, "Spark Staff")).toBe(true);
  });

  it("does not treat an unknown department as led", () => {
    // A row whose department dropped out of the list must not read as fine.
    const orphan = [{ department_id: "gone", department_name: "?", department_code: "X" }];
    expect(everyDepartmentHasLead(orphan, DEPTS, null)).toBe(false);
  });
});
