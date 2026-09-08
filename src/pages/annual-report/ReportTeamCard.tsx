// Report team — the Spark super-admin's way into the three workspaces that
// actually do the work of a reporting cycle.
//
// The rows are ROLES, not people: there is one PM per cycle but a head and an
// assignee per department, so the two department rows are driven by a switcher
// rather than repeated eight times.
//
// Open does NOT log you in as anyone. It hands your own token to the SAR app,
// which is where PMs, department leads and department users live — Centriyon has
// no pages for them at all. You arrive as yourself, with your own permissions.
// A new tab rather than a redirect, because a same-tab hop loses the acting
// company (the same reason AppSwitcher hides itself for this role).

import { useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getToken } from "@/lib/api";
import type { Cycle, CycleDepartmentProgress } from "@/types/cycles";
import { ProgressBar, SessionStatusBadge } from "./cycle-ui";

const PRIMARY = "#4040C8";
const MUTED = "#9BA3C4";

// The spark_studio *app* (:3000), not VITE_SAR_URL which is the cycles API.
const SAR_APP_URL = (
  import.meta.env.VITE_SAR_APP_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

const th: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: MUTED,
  textTransform: "uppercase",
  letterSpacing: ".5px",
  textAlign: "left",
  padding: "12px 16px",
};

const td: React.CSSProperties = { fontSize: 12, color: "#1A1D2E", padding: "14px 16px" };

/** `null` when we can't build a working link — the caller disables Open. */
function workspaceUrl(path: string | null, companyId?: string | null): string | null {
  const token = getToken();
  if (!token || !path) return null;
  const qs = new URLSearchParams({ token, next: path });
  // Spark carries no company of its own; without this every scoped route in the
  // SAR app answers "Select a company first".
  if (companyId) qs.set("company", companyId);
  return `${SAR_APP_URL}/auth/token?${qs.toString()}`;
}

function OpenButton({ href, title }: { href: string | null; title: string }) {
  if (!href) {
    return (
      <span
        className="btn bs bsm"
        title={title}
        style={{ opacity: 0.45, cursor: "not-allowed", padding: "4px 12px" }}
      >
        Open ↗
      </span>
    );
  }
  return (
    <a
      className="btn bs bsm"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ textDecoration: "none", padding: "4px 12px" }}
    >
      Open ↗
    </a>
  );
}

function RoleRow({
  role,
  blurb,
  detail,
  extra,
  href,
  disabledReason,
}: {
  role: string;
  blurb: string;
  detail: React.ReactNode;
  extra?: React.ReactNode;
  href: string | null;
  disabledReason: string;
}) {
  return (
    <tr style={{ borderTop: "1px solid #F4F5FB" }}>
      <td style={{ ...td, width: 190 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: PRIMARY, letterSpacing: ".4px" }}>
          {role}
        </div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{blurb}</div>
      </td>
      <td style={td}>{detail}</td>
      <td style={td}>{extra}</td>
      <td style={{ ...td, textAlign: "right", width: 110 }}>
        <OpenButton href={href} title={href ? "Opens in a new tab" : disabledReason} />
      </td>
    </tr>
  );
}

export default function ReportTeamCard({
  cycle,
  departments,
  pmName,
}: {
  cycle: Cycle;
  departments: CycleDepartmentProgress[];
  pmName?: string;
}) {
  const { actingCompany } = useAuth();
  const [deptId, setDeptId] = useState<string>(() => departments[0]?.department_id ?? "");

  const dept = useMemo(
    () => departments.find((d) => d.department_id === deptId) ?? departments[0],
    [departments, deptId],
  );

  const companyId = actingCompany?.id ?? cycle.company_id;
  const sessionId = dept?.session_id;

  const pmHref = workspaceUrl("/pm", companyId);
  // Both department workspaces are addressed by session, so a department with no
  // session yet — an unactivated cycle — has nowhere to link to.
  const hodHref = workspaceUrl(sessionId ? `/hod/sessions/${sessionId}` : null, companyId);
  const userHref = workspaceUrl(
    sessionId ? `/department/sessions/${sessionId}` : null,
    companyId,
  );

  const noSession = "This department has no session yet — activate the cycle first";
  const muted = (text: string) => <span style={{ color: "#C4C9DD" }}>{text}</span>;

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid #ECEEF8",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1A1D2E" }}>Report team</div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
            Open any workspace in a new tab — as yourself, with your own permissions
          </div>
        </div>
        {departments.length > 0 && (
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#5A6080" }}>Department</span>
            <select
              className="inp sel"
              value={dept?.department_id ?? ""}
              onChange={(e) => setDeptId(e.target.value)}
              style={{ width: 220 }}
            >
              {departments.map((d) => (
                <option key={d.department_id} value={d.department_id}>
                  {d.department_name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#FAFBFE" }}>
            <th style={th}>Role</th>
            <th style={th}>Who</th>
            <th style={th}>Progress</th>
            <th style={{ ...th, width: 110 }} />
          </tr>
        </thead>
        <tbody>
          <RoleRow
            role="PROJECT MANAGER"
            blurb="Kickoff, questions, assembly"
            detail={
              pmName ? (
                <>
                  <div style={{ fontWeight: 700 }}>{pmName}</div>
                  <div style={{ fontSize: 11, color: MUTED }}>owns this cycle</div>
                </>
              ) : (
                muted("Not set")
              )
            }
            extra={
              <span style={{ fontSize: 11, color: MUTED }}>
                {cycle.total_departments ?? departments.length} departments
              </span>
            }
            href={pmHref}
            disabledReason="No session token"
          />

          <RoleRow
            role="DEPARTMENT HEAD"
            blurb="Curates questions, reviews answers"
            detail={
              dept?.hod_name ? (
                <>
                  <div style={{ fontWeight: 700 }}>{dept.hod_name}</div>
                  <div style={{ fontSize: 11, color: MUTED }}>{dept.department_name}</div>
                </>
              ) : (
                muted("Not set")
              )
            }
            extra={dept ? <SessionStatusBadge status={dept.session_status} /> : null}
            href={hodHref}
            disabledReason={noSession}
          />

          <RoleRow
            role="DEPARTMENT USER"
            blurb="Answers assigned questions"
            detail={
              dept?.assigned_user_name ? (
                <>
                  <div style={{ fontWeight: 700 }}>{dept.assigned_user_name}</div>
                  {dept.assigned_user_email && (
                    <div style={{ fontSize: 11, color: MUTED }}>{dept.assigned_user_email}</div>
                  )}
                </>
              ) : (
                muted("Nobody")
              )
            }
            extra={
              dept ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <ProgressBar pct={dept.progress} width={90} />
                  <span
                    style={{
                      fontSize: 11,
                      color: "#5A6080",
                      fontFamily: "'DM Mono', monospace",
                    }}
                  >
                    {Number.isFinite(dept.progress) ? Math.round(dept.progress) : 0}%
                  </span>
                </div>
              ) : null
            }
            href={userHref}
            disabledReason={noSession}
          />
        </tbody>
      </table>

      {departments.length === 0 && (
        <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: MUTED }}>
          No departments assigned yet — the two department rows fill in once they are.
        </div>
      )}
    </div>
  );
}
