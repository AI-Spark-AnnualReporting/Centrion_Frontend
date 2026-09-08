// The company directory — where a `spark_internal` (Spark staff) session lands.
//
// Spark accounts carry no company of their own, so this is the one page that
// means anything before they pick one. Choosing a company sets the acting
// company (AuthContext.switchCompany) and drops them straight into that
// client's annual report, which is the work this role exists to do.
//
// The four numbers at the top all come off the same request as the rows — see
// the route docstring. They are deliberately the ones the system actually
// maintains: nothing ever writes a cycle's 'completed' status, so a "delivered"
// card would read 0 for ever.
//
// No status pill and no progress bar per company: a directory is for finding a
// client, not judging one.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Spinner } from "@/components/shared/Spinner";
import { useAuth } from "@/context/AuthContext";
import {
  sparkInternal,
  type SparkCompanyRow,
  type SparkDirectoryStats,
} from "@/lib/api";
import { gradientFor, initialsOf } from "@/lib/avatar";

const PRIMARY = "#4040C8";

// Server-side, not a view of one list: each tab is its own request, so the
// stat tiles above describe whatever is listed underneath them. Which is also
// why the tabs carry no counts — only one scope's total is known at a time, and
// the Companies tile already shows it.
type Filter = "mine" | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "mine", label: "Yours" },
  { key: "all", label: "All" },
];

const th: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "#9BA3C4",
  textTransform: "uppercase",
  letterSpacing: ".5px",
  textAlign: "left",
  padding: "12px 16px",
};

const td: React.CSSProperties = { fontSize: 12, color: "#1A1D2E", padding: "14px 16px" };

function StatTile({
  icon,
  value,
  label,
  hint,
  amber,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  hint: string;
  amber?: boolean;
}) {
  return (
    <div
      className="card"
      style={{
        flex: 1,
        minWidth: 0,
        padding: 16,
        ...(amber ? { background: "#FFFBEB", borderColor: "#FCE7B0" } : {}),
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: amber ? "rgba(245,158,11,.14)" : "#EEEEFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: amber ? "#B45309" : PRIMARY,
          marginBottom: 12,
        }}
      >
        {icon}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 800,
          color: amber ? "#B45309" : "#1A1D2E",
          lineHeight: 1,
          fontFamily: "'DM Mono', monospace",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#1A1D2E", marginTop: 8 }}>{label}</div>
      <div style={{ fontSize: 11, color: "#9BA3C4", marginTop: 2 }}>{hint}</div>
    </div>
  );
}

function AddCompanyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (company: { id: string; name: string }) => void;
}) {
  const [name, setName] = useState("");
  const [jurisdiction, setJurisdiction] = useState("KSA");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Company name is required.");
      return;
    }
    setSaving(true);
    setError("");
    sparkInternal
      .createCompany({ name: trimmed, jurisdiction: jurisdiction.trim() || null })
      .then((res) => onCreated(res.company))
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Could not create the company.");
        setSaving(false);
      });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ width: 440 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "20px 24px 14px" }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Add company</div>
          <div style={{ fontSize: 12, color: "#5A6080", marginTop: 4 }}>
            Creates the company, then takes you through its setup. You stay logged in.
          </div>
        </div>

        <div style={{ padding: "4px 24px 8px" }}>
          <label className="fl-label">Company name</label>
          <input
            className="inp"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Acme Corporation"
            style={{ marginBottom: 14 }}
          />

          <label className="fl-label">Jurisdiction</label>
          <input
            className="inp"
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
          />

          {error && (
            <div style={{ marginTop: 12, fontSize: 12, color: "#DC2626" }}>{error}</div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            padding: "14px 24px 18px",
            borderTop: "1px solid #ECEEF8",
            marginTop: 10,
          }}
        >
          <button type="button" className="btn bs" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn bp" onClick={submit} disabled={saving}>
            {saving ? "Creating…" : "Create and set up →"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SparkCompaniesPage() {
  const navigate = useNavigate();
  const { switchCompany, leaveCompany, actingCompany } = useAuth();
  const [companies, setCompanies] = useState<SparkCompanyRow[]>([]);
  const [stats, setStats] = useState<SparkDirectoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("mine");
  const [adding, setAdding] = useState(false);

  // Catch-all: the sidebar button and the "Acting as" chip already clear before
  // navigating, but browser-back and a typed URL can land here with a company
  // still selected, and the directory must never be shown from inside a client.
  // Costs a remount on that path (AppLayout is keyed on the acting company), so
  // the click paths deliberately clear first instead of relying on this.
  //
  // ON MOUNT ONLY. Depending on `actingCompany` would make this fire the instant
  // a row sets it and wipe the selection before the navigate lands.
  useEffect(() => {
    if (actingCompany) leaveCompany();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-runs on the tab, because the scope is the server's to decide — the stats
  // are computed from whichever companies it returns, so they cannot be narrowed
  // here. Re-arm `loading` or the stale list stays on screen under new numbers.
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    sparkInternal
      .companies({ mine: filter === "mine" })
      .then((res) => {
        if (!live) return;
        setCompanies(res.companies ?? []);
        setStats(res.stats ?? null);
      })
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : "Failed to load companies.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [filter]);

  // Search only — the tab is applied server-side.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => (c.name ?? "").toLowerCase().includes(q));
  }, [companies, search]);

  // Enter a company and go where its work actually is — its annual report,
  // not the Command Center.
  const open = (c: SparkCompanyRow) => {
    switchCompany({ id: c.id, name: c.name });
    navigate("/annual-report");
  };

  // A brand-new company has nothing to report on yet, so go to setup instead.
  const openNew = (c: { id: string; name: string }) => {
    switchCompany(c);
    navigate("/onboarding");
  };

  return (
    <div style={{ paddingBottom: 96 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1A1D2E", margin: 0 }}>
            Companies
          </h1>
          <p style={{ fontSize: 12, color: "#5A6080", marginTop: 2 }}>
            Pick a client to work inside, or add a new one.
          </p>
        </div>
        <button type="button" className="btn bp" onClick={() => setAdding(true)}>
          + Add company
        </button>
      </div>

      {/* Headline numbers */}
      <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
        <StatTile
          icon={
            <svg viewBox="0 0 14 14" width="15" height="15" fill="none">
              <rect x="1.5" y="4" width="4.5" height="8.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
              <rect x="8" y="1.5" width="4.5" height="11" rx="1" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          }
          value={stats?.companies ?? "—"}
          label="Companies"
          hint="client workspaces"
        />
        <StatTile
          icon={
            <svg viewBox="0 0 14 14" width="15" height="15" fill="none">
              <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3" />
              <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          }
          value={stats?.active_cycles ?? "—"}
          label="Active cycles"
          hint={
            stats
              ? `across ${stats.active_client_count} ${stats.active_client_count === 1 ? "client" : "clients"}`
              : "in progress"
          }
        />
        <StatTile
          amber={!!stats?.past_deadline}
          icon={
            <svg viewBox="0 0 14 14" width="15" height="15" fill="none">
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M7 4v3.2M7 9.4v.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          }
          value={stats?.past_deadline ?? "—"}
          label="Past deadline"
          hint={
            stats?.past_deadline
              ? `oldest ${stats.oldest_overdue_days} days over`
              : "nothing overdue"
          }
        />
        <StatTile
          icon={
            <svg viewBox="0 0 14 14" width="15" height="15" fill="none">
              <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M1.5 5.5h11M4.5 1v2M9.5 1v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          }
          value={stats?.due_soon ?? "—"}
          label="Due in 30 days"
          hint={
            stats?.next_due
              ? `next: ${stats.next_due.company_name ?? "—"} · ${stats.next_due.date}`
              : "nothing due"
          }
        />
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid #ECEEF8",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div className="tabs" style={{ marginBottom: 0 }}>
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={`tab ${filter === f.key ? "act" : ""}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div style={{ position: "relative", width: 240 }}>
            <input
              className="inp"
              placeholder="Search company"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 30 }}
            />
            <svg
              viewBox="0 0 13 13"
              width="13"
              height="13"
              fill="none"
              style={{ position: "absolute", left: 11, top: 12, color: "#9BA3C4" }}
            >
              <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8.5 8.5l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {loading ? (
          <Spinner />
        ) : error ? (
          <div style={{ padding: 32, textAlign: "center", fontSize: 12, color: "#5A6080" }}>
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1D2E" }}>
              {companies.length > 0
                ? "No companies match"
                : filter === "mine"
                  ? "You haven't added any companies"
                  : "No companies yet"}
            </div>
            <div style={{ fontSize: 12, color: "#9BA3C4", marginTop: 4 }}>
              {companies.length > 0
                ? "Try a different search."
                : filter === "mine"
                  ? "Add one, or switch to All to see every client."
                  : "Add your first company to get started."}
            </div>
          </div>
        ) : (
          <table className="utable">
            <thead>
              <tr>
                <th style={th}>Company</th>
                <th style={th}>Reporting cycles</th>
                <th style={{ ...th, width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className="urow"
                  style={{ cursor: "pointer" }}
                  onClick={() => open(c)}
                >
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span
                        className="av av-ring"
                        style={{
                          background: gradientFor(c.id),
                          width: 34,
                          height: 34,
                          fontSize: 11,
                          borderRadius: 10,
                        }}
                      >
                        {initialsOf(c.name ?? "")}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 12.5 }}>{c.name}</span>
                    </div>
                  </td>
                  <td style={td}>
                    {c.cycle_count > 0 ? (
                      <span
                        style={{
                          fontFamily: "'DM Mono', monospace",
                          fontSize: 12,
                          fontWeight: 700,
                          color: PRIMARY,
                        }}
                      >
                        {c.cycle_count}
                        <span style={{ color: "#9BA3C4", fontWeight: 400, marginLeft: 5 }}>
                          {c.cycle_count === 1 ? "cycle" : "cycles"}
                        </span>
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: "#C4C9DD" }}>Not started</span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <span className="uchev">
                      <svg viewBox="0 0 12 12" width="11" height="11" fill="none">
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
              ))}
            </tbody>
          </table>
        )}
      </div>

      {adding && <AddCompanyModal onClose={() => setAdding(false)} onCreated={openNew} />}
    </div>
  );
}
