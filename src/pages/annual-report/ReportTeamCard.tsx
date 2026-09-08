// Report team — the Spark super-admin's way into the workspaces that do the work
// of a reporting cycle.
//
// The PM is pinned at the top because they are cycle-level. Below that, one row
// per department; clicking a row opens an area underneath showing the roles that
// department carries on THIS cycle — its head and whoever was assigned to answer
// — each with its own Open.
//
// Open does NOT log you in as anyone. It hands over your own token, which is why
// you arrive as yourself with your own permissions. A new tab, not a redirect,
// because a same-tab hop loses the acting company (the same reason AppSwitcher
// hides itself for this role). The link also carries this page's URL, so the SAR
// tab's nav button can bring you straight back here instead of to the client's
// dashboard.

import { Fragment, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getToken } from "@/lib/api";
import type { Cycle, CycleDepartmentProgress, SessionStatus } from "@/types/cycles";
import { ProgressBar, SessionStatusBadge } from "./cycle-ui";

const PRIMARY = "#4040C8";
const MUTED = "#9BA3C4";

// The spark_studio *app* (:3000), not VITE_SAR_URL which is the cycles API.
const SAR_APP_URL = (
  import.meta.env.VITE_SAR_APP_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

// Left accent per row, so the list can be read at a glance. Mirrors the badge
// colours in SESSION_STATUS (cycle-ui) rather than inventing a second scale.
const STATUS_ACCENT: Record<SessionStatus, string> = {
  not_started: "#C4C9DD",
  in_progress: "#B45309",
  submitted: "#2563EB",
  approved: "#16A34A",
};

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
  // Where the SAR tab's nav button should return to. Without it that button
  // resolves to the client's own dashboard, which this role must never see.
  if (typeof window !== "undefined") qs.set("back", window.location.href);
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

/** One role inside an expanded department. */
function RoleLine({
  role,
  blurb,
  who,
  sub,
  href,
  disabledReason,
}: {
  role: string;
  blurb: string;
  who: string | null | undefined;
  sub?: string | null;
  href: string | null;
  disabledReason: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "10px 0",
        borderTop: "1px solid #ECEEF8",
      }}
    >
      <div style={{ width: 170, flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: PRIMARY, letterSpacing: ".4px" }}>
          {role}
        </div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{blurb}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {who ? (
          <>
            <div style={{ fontWeight: 700, fontSize: 12 }}>{who}</div>
            {sub && <div style={{ fontSize: 11, color: MUTED }}>{sub}</div>}
          </>
        ) : (
          <span style={{ color: "#C4C9DD", fontSize: 12 }}>Nobody</span>
        )}
      </div>
      <OpenButton href={href} title={href ? "Opens in a new tab" : disabledReason} />
    </div>
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
  const [expanded, setExpanded] = useState<string | null>(null);

  const companyId = actingCompany?.id ?? cycle.company_id;
  const pmHref = useMemo(() => workspaceUrl("/pm", companyId), [companyId]);

  const noSession = "This department has no session yet — activate the cycle first";
  const muted = (text: string) => <span style={{ color: "#C4C9DD" }}>{text}</span>;

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #ECEEF8" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#1A1D2E" }}>Report team</div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
          Open any workspace in a new tab — as yourself, with your own permissions
        </div>
      </div>

      {/* PM is cycle-level, so it sits above the departments rather than in them. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "14px 16px",
          background: "#FAFBFE",
          borderBottom: "1px solid #ECEEF8",
        }}
      >
        <div style={{ width: 170, flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: PRIMARY, letterSpacing: ".4px" }}>
            PROJECT MANAGER
          </div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
            Kickoff, questions, assembly
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {pmName ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 12 }}>{pmName}</div>
              <div style={{ fontSize: 11, color: MUTED }}>owns this cycle</div>
            </>
          ) : (
            muted("Not set")
          )}
        </div>
        <span style={{ fontSize: 11, color: MUTED }}>
          {departments.length} {departments.length === 1 ? "department" : "departments"}
        </span>
        <OpenButton href={pmHref} title={pmHref ? "Opens in a new tab" : "No session token"} />
      </div>

      {departments.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: MUTED }}>
          No departments assigned to this cycle yet.
        </div>
      ) : (
        <table className="utable" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#FAFBFE" }}>
              <th style={th}>Department</th>
              <th style={th}>Head of department</th>
              <th style={th}>Assigned to</th>
              <th style={th}>Status</th>
              <th style={th}>Progress</th>
              <th style={{ ...th, width: 60 }} />
            </tr>
          </thead>
          <tbody>
            {departments.map((d) => {
              const isOpen = expanded === d.department_id;
              const hodHref = workspaceUrl(
                d.session_id ? `/hod/sessions/${d.session_id}` : null,
                companyId,
              );
              const userHref = workspaceUrl(
                d.session_id ? `/department/sessions/${d.session_id}` : null,
                companyId,
              );
              return (
                <Fragment key={d.department_id}>
                  <tr
                    className="urow"
                    style={{
                      cursor: "pointer",
                      background: isOpen ? "#FAFBFE" : undefined,
                      // Read by .urow's ::before accent bar.
                      ["--row-accent" as string]:
                        STATUS_ACCENT[d.session_status] ?? STATUS_ACCENT.not_started,
                    }}
                    onClick={() => setExpanded(isOpen ? null : d.department_id)}
                  >
                    <td style={td}>
                      <div style={{ fontWeight: 700 }}>{d.department_name}</div>
                      <div style={{ fontSize: 10, color: MUTED }}>{d.department_code}</div>
                    </td>
                    <td style={td}>{d.hod_name ?? muted("Not set")}</td>
                    <td style={td}>
                      {d.assigned_user_name ? (
                        <>
                          <div>{d.assigned_user_name}</div>
                          {d.assigned_user_email && (
                            <div style={{ fontSize: 10, color: MUTED }}>
                              {d.assigned_user_email}
                            </div>
                          )}
                        </>
                      ) : (
                        muted("Nobody")
                      )}
                    </td>
                    <td style={td}>
                      <SessionStatusBadge status={d.session_status} />
                    </td>
                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <ProgressBar pct={d.progress} width={90} />
                        <span
                          style={{
                            fontSize: 11,
                            color: "#5A6080",
                            fontFamily: "'DM Mono', monospace",
                          }}
                        >
                          {Number.isFinite(d.progress) ? Math.round(d.progress) : 0}%
                        </span>
                      </div>
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <span className={`uchev ${isOpen ? "open" : ""}`}>
                        <svg
                          viewBox="0 0 12 12"
                          width="11"
                          height="11"
                          fill="none"
                          style={{
                            transform: isOpen ? "rotate(90deg)" : "none",
                            transition: ".15s",
                          }}
                        >
                          <path
                            d="M4.5 2.5L8 6l-3.5 3.5"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td
                        colSpan={6}
                        style={{
                          background: "#FAFBFE",
                          padding: "4px 16px 14px",
                          borderBottom: "1px solid #F4F5FB",
                        }}
                      >
                        <RoleLine
                          role="DEPARTMENT HEAD"
                          blurb="Curates questions, reviews answers"
                          who={d.hod_name}
                          sub={d.department_name}
                          href={hodHref}
                          disabledReason={noSession}
                        />
                        <RoleLine
                          role="DEPARTMENT USER"
                          blurb="Answers assigned questions"
                          who={d.assigned_user_name}
                          sub={d.assigned_user_email}
                          href={userHref}
                          disabledReason={noSession}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
