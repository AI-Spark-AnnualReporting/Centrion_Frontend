// The Report team card is mostly a URL builder, and the URL is where it can go
// wrong invisibly:
//
//   - miss `company` and every scoped route in the SAR app answers
//     "Select a company first" — the tab opens on a broken page, not an error;
//   - miss `next` and every row lands in the same place, which is exactly the
//     bug the department switcher exists to avoid;
//   - link a department with no session yet and the tab opens on nothing.
//
// It must also stay a NEW tab: a same-tab hop loses the acting company.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Cycle, CycleDepartmentProgress } from "@/types/cycles";

vi.mock("@/lib/api", () => ({ getToken: () => "jwt-abc" }));

let actingCompany: { id: string; name: string } | null = { id: "cmp_1", name: "Acme" };
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ actingCompany }),
}));

const { default: ReportTeamCard } = await import(
  "@/pages/annual-report/ReportTeamCard"
);

const CYCLE = {
  id: "cyc_1",
  company_id: "cmp_1",
  fiscal_year: 2026,
  status: "active",
  project_manager_id: "usr_pm",
  submission_deadline: "2026-03-31",
  has_subsidiaries: false,
  has_sukuk: false,
  created_at: "",
  updated_at: "",
  total_departments: 2,
} as Cycle;

const DEPTS = [
  {
    session_id: "sess_hr",
    department_id: "dep_hr",
    department_name: "Human Resources",
    department_code: "HR",
    hod_name: "Hr HOD",
    assigned_user_name: "Sara Khalid",
    assigned_user_email: "sara@acme.com",
    session_status: "in_progress",
    progress: 36,
    submitted_at: null,
  },
  {
    // Not activated yet — no session, so nowhere to link to.
    department_id: "dep_fin",
    department_name: "Finance",
    department_code: "FIN",
    hod_name: null,
    session_status: "not_started",
    progress: 0,
    submitted_at: null,
  },
] as CycleDepartmentProgress[];

const links = () =>
  Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href")!);

describe("Report team card", () => {
  beforeEach(() => {
    actingCompany = { id: "cmp_1", name: "Acme" };
  });

  it("sends each role to a different workspace", () => {
    render(<ReportTeamCard cycle={CYCLE} departments={DEPTS} pmName="Sara Nasser" />);
    fireEvent.click(screen.getByText("Human Resources"));
    const paths = links().map((h) => new URL(h).searchParams.get("next"));
    expect(paths).toEqual(["/pm", "/hod/sessions/sess_hr"]);
  });

  it("tells the SAR tab where to come back to", () => {
    // Without this the nav button over there resolves to the CLIENT's
    // dashboard, which this role must never see.
    render(<ReportTeamCard cycle={CYCLE} departments={DEPTS} pmName="Sara Nasser" />);
    const back = new URL(links()[0]).searchParams.get("back");
    expect(back).toBe(window.location.href);
  });

  it("carries the token and the acting company on every link", () => {
    render(<ReportTeamCard cycle={CYCLE} departments={DEPTS} pmName="Sara Nasser" />);
    fireEvent.click(screen.getByText("Human Resources"));
    for (const href of links()) {
      const q = new URL(href).searchParams;
      expect(q.get("token")).toBe("jwt-abc");
      // Without this the SAR app has no company and every scoped route 403s.
      expect(q.get("company")).toBe("cmp_1");
    }
  });

  it("opens in a new tab, and can't reach back into this one", () => {
    render(<ReportTeamCard cycle={CYCLE} departments={DEPTS} pmName="Sara Nasser" />);
    fireEvent.click(screen.getByText("Human Resources"));
    for (const a of document.querySelectorAll("a")) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  it("hides each department's roles until its row is clicked", () => {
    render(<ReportTeamCard cycle={CYCLE} departments={DEPTS} pmName="Sara Nasser" />);
    // Collapsed: only the PM can be opened.
    expect(links()).toHaveLength(1);
    expect(screen.queryByText("DEPARTMENT HEAD")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Human Resources"));
    expect(screen.getByText("DEPARTMENT HEAD")).toBeInTheDocument();

    const paths = links().map((h) => new URL(h).searchParams.get("next"));
    expect(paths).toEqual(["/pm", "/hod/sessions/sess_hr"]);
  });

  it("collapses again, and only one department is open at a time", () => {
    const withTwo: CycleDepartmentProgress[] = [
      DEPTS[0],
      { ...DEPTS[1], session_id: "sess_fin" },
    ];
    render(<ReportTeamCard cycle={CYCLE} departments={withTwo} pmName="Sara Nasser" />);

    fireEvent.click(screen.getByText("Human Resources"));
    let paths = links().map((h) => new URL(h).searchParams.get("next"));
    expect(paths).toContain("/hod/sessions/sess_hr");

    // Opening another closes the first — otherwise two "DEPARTMENT HEAD"
    // headings would be on screen with no way to tell them apart.
    fireEvent.click(screen.getByText("Finance"));
    paths = links().map((h) => new URL(h).searchParams.get("next"));
    expect(paths).toContain("/hod/sessions/sess_fin");
    expect(paths).not.toContain("/hod/sessions/sess_hr");

    fireEvent.click(screen.getByText("Finance"));
    expect(screen.queryByText("DEPARTMENT HEAD")).not.toBeInTheDocument();
  });

  it("still expands a department with no session, but can't open it", () => {
    render(<ReportTeamCard cycle={CYCLE} departments={[DEPTS[1]]} pmName="Sara Nasser" />);
    fireEvent.click(screen.getByText("Finance"));
    // The roles are visible so you can see who they are...
    expect(screen.getByText("DEPARTMENT HEAD")).toBeInTheDocument();
    // ...but PM is cycle-level and the only thing openable.
    expect(links()).toHaveLength(1);
    expect(new URL(links()[0]).searchParams.get("next")).toBe("/pm");
  });

  it("still renders when nothing is assigned", () => {
    render(<ReportTeamCard cycle={CYCLE} departments={[]} pmName={undefined} />);
    expect(screen.getByText("Not set")).toBeInTheDocument();
    expect(screen.getByText(/No departments assigned to this cycle yet/)).toBeInTheDocument();
  });

  it("says Nobody, not Unknown, when a department has no head", () => {
    // SAR sends the literal "Unknown" for an empty name; api.ts maps it to
    // undefined so this fallback can fire. The mapping itself is now guarded by
    // cycle-overview-mapping.test.ts and by CycleDetailPage's Assigned user
    // column — this only holds the rendering end of it.
    const headless: CycleDepartmentProgress[] = [
      { ...DEPTS[0], hod_name: undefined },
    ];
    render(<ReportTeamCard cycle={CYCLE} departments={headless} pmName="Sara Nasser" />);
    fireEvent.click(screen.getByText("Human Resources"));
    expect(screen.getByText("Nobody")).toBeInTheDocument();
    expect(screen.queryByText("Unknown")).not.toBeInTheDocument();
  });

  it("falls back to the cycle's company when acting on none", () => {
    // A client admin reading their own cycle has no acting company.
    actingCompany = null;
    render(<ReportTeamCard cycle={CYCLE} departments={DEPTS} pmName="Sara Nasser" />);
    expect(new URL(links()[0]).searchParams.get("company")).toBe("cmp_1");
  });
});
