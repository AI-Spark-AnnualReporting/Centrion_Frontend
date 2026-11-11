// One Spark list — /spark/companies, /spark/reports, /spark/users. Reached
// from the sidebar; the overview at /spark deliberately carries no lists.
//
// All three sections share a page because they differ only in their columns:
// companies are flat, users and reports are grouped under the company that
// owns them. Splitting them into three routes would triple the search, the
// grouping and the empty states to save nothing.

import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Spinner } from '@/components/shared/Spinner';
import { spark } from '@/lib/api';
import { roleMeta } from '@/constants/roles';
import type {
  SparkCompanyRow,
  SparkReportRow,
  SparkUserRow,
} from '@/types/spark';
import { relativeTime, shortDateTime } from '@/lib/time';
import { gradientFor, initialsOf } from '@/lib/avatar';
import { titleCase as label } from '@/lib/utils';
import { SECTIONS, isSectionKey, type SectionKey } from '@/constants/spark-sections';

const PRIMARY = '#4040C8';

const STATUS_BADGE: Record<string, string> = {
  active: 'b-gn',
  invited: 'b-am',
  suspended: 'b-rd',
  draft: 'b-gy',
  in_review: 'b-am',
  approved: 'b-bl',
  published: 'b-gn',
  failed: 'b-rd',
};

// A deterministic gradient tile — the same device the admin users table uses
// for people, reused for companies and report types so a long grouped list has
// something to scan by other than text.
function Tile({
  seed,
  text,
  size = 34,
  radius = '50%',
}: {
  seed: string;
  text: string;
  size?: number;
  radius?: number | string;
}) {
  return (
    <span
      className="av av-ring"
      style={{
        background: gradientFor(seed),
        width: size,
        height: size,
        borderRadius: radius,
        fontSize: size <= 26 ? 9 : 11,
      }}
    >
      {text}
    </span>
  );
}

function Dash() {
  return <span style={{ color: '#C4C9DD' }}>—</span>;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ padding: 52, textAlign: 'center' }}>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          background: '#F2F3FA',
          color: '#C4C9DD',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 12px',
        }}
      >
        <svg viewBox="0 0 16 16" width="18" height="18" fill="none">
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10.8 10.8L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1D2E' }}>{text}</div>
      <div style={{ fontSize: 12, color: '#9BA3C4', marginTop: 4 }}>
        Try a different search.
      </div>
    </div>
  );
}

// ── Grouping ───────────────────────────────────────────────────────────────
interface Group<T> {
  id: string;
  name: string;
  rows: T[];
}

function groupByCompany<T extends { company_id: string; company_name: string }>(
  rows: T[],
): Group<T>[] {
  const byId = new Map<string, Group<T>>();
  for (const row of rows) {
    // A row whose company the backend couldn't resolve still has to appear —
    // dropping it would make the list disagree with the count that led here.
    const id = row.company_id || '—';
    let g = byId.get(id);
    if (!g) {
      g = { id, name: row.company_name || 'Unassigned', rows: [] };
      byId.set(id, g);
    }
    g.rows.push(row);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function GroupedTable<T>({
  groups,
  head,
  renderRow,
  colSpan,
  emptyText,
  unit,
}: {
  groups: Group<T>[];
  head: React.ReactNode;
  renderRow: (row: T) => React.ReactNode;
  colSpan: number;
  emptyText: string;
  unit: string;
}) {
  // Collapsed ids rather than expanded ones: everything is open by default,
  // which is the point of grouping by company.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  if (groups.length === 0) return <EmptyState text={emptyText} />;

  return (
    <table className="utable">
      <thead>{head}</thead>
      {groups.map((g) => {
        const isCollapsed = collapsed.has(g.id);
        return (
          <tbody key={g.id}>
            <tr>
              <td
                colSpan={colSpan}
                style={{
                  padding: 0,
                  background: isCollapsed ? '#FAFBFE' : '#F4F5FC',
                  borderTop: '1px solid #E7E9F5',
                  borderBottom: isCollapsed ? '1px solid #F1F2F9' : '1px solid #E7E9F5',
                  // Left accent on the open group so the rows underneath read
                  // as belonging to it rather than floating.
                  boxShadow: isCollapsed ? 'none' : `inset 3px 0 0 ${PRIMARY}`,
                }}
              >
                <button
                  type="button"
                  onClick={() => toggle(g.id)}
                  aria-expanded={!isCollapsed}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '9px 16px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    font: 'inherit',
                  }}
                >
                  <svg
                    viewBox="0 0 12 12"
                    width="10"
                    height="10"
                    fill="none"
                    style={{
                      color: isCollapsed ? '#9BA3C4' : PRIMARY,
                      flexShrink: 0,
                      transform: isCollapsed ? 'none' : 'rotate(90deg)',
                      transition: '.15s',
                    }}
                  >
                    <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <Tile seed={g.id} text={initialsOf(g.name)} size={26} radius={8} />
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: '#1A1D2E' }}>
                    {g.name}
                  </span>
                  <span className="uhead-count">{g.rows.length}</span>
                  <span
                    style={{ marginLeft: 'auto', fontSize: 10.5, color: '#9BA3C4', fontWeight: 600 }}
                  >
                    {g.rows.length} {g.rows.length === 1 ? unit : `${unit}s`}
                  </span>
                </button>
              </td>
            </tr>
            {!isCollapsed && g.rows.map(renderRow)}
          </tbody>
        );
      })}
    </table>
  );
}

// A zero reads as "nothing here" rather than a number worth scanning, so it
// loses the pill and greys out.
function CountPill({ n }: { n: number }) {
  if (!n) return <span style={{ color: '#C4C9DD', fontWeight: 700 }}>0</span>;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 26,
        padding: '3px 8px',
        borderRadius: 20,
        background: '#F2F3FA',
        color: '#1A1D2E',
        fontSize: 11,
        fontWeight: 800,
        fontFamily: "'DM Mono', monospace",
      }}
    >
      {n}
    </span>
  );
}

function CompaniesTable({ rows }: { rows: SparkCompanyRow[] }) {
  if (rows.length === 0) return <EmptyState text="No companies match this search" />;
  return (
    <table className="utable">
      <thead>
        <tr>
          <th>Company</th>
          <th>Sector</th>
          <th>Jurisdiction</th>
          <th style={{ textAlign: 'right' }}>Users</th>
          <th style={{ textAlign: 'right' }}>Reports</th>
          <th>Joined</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id} className="urow">
            <td>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <Tile seed={c.id} text={initialsOf(c.name)} radius={9} />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      color: '#1A1D2E',
                      fontSize: 12.5,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                    }}
                  >
                    {c.name}
                    {c.is_active === false && <span className="badge b-rd">Inactive</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 1 }}>
                    {c.jurisdiction || 'Jurisdiction not set'}
                  </div>
                </div>
              </div>
            </td>
            <td style={{ color: '#5A6080' }}>{c.sector_name || <Dash />}</td>
            <td style={{ color: '#5A6080' }}>{c.jurisdiction || <Dash />}</td>
            <td style={{ textAlign: 'right' }}>
              <CountPill n={c.user_count ?? 0} />
            </td>
            <td style={{ textAlign: 'right' }}>
              <CountPill n={c.report_count ?? 0} />
            </td>
            <td style={{ color: '#5A6080' }}>
              {c.created_at ? shortDateTime(c.created_at) : <Dash />}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function SparkSectionPage() {
  const { section } = useParams<{ section: string }>();
  const [companies, setCompanies] = useState<SparkCompanyRow[] | null>(null);
  const [users, setUsers] = useState<SparkUserRow[] | null>(null);
  const [reports, setReports] = useState<SparkReportRow[] | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const valid = isSectionKey(section);

  // Clear the search when moving between sections — a term that matched users
  // is rarely the one you want on reports, and a filtered-to-empty list on
  // arrival reads as "no data" rather than "still filtered".
  useEffect(() => setSearch(''), [section]);

  useEffect(() => {
    if (!valid) return;
    let alive = true;
    setError('');
    // Companies come from the overview — it's the only endpoint that carries
    // them, and its per-company counts are what the table's columns show.
    const load =
      section === 'users'
        ? spark.listUsers()
        : section === 'reports'
          ? spark.listReports()
          : spark.overview().then((o) => o.companies);
    load
      .then((rows) => {
        if (!alive) return;
        if (section === 'users') setUsers(rows as SparkUserRow[]);
        else if (section === 'reports') setReports(rows as SparkReportRow[]);
        else setCompanies(rows as SparkCompanyRow[]);
      })
      .catch(
        (e) =>
          alive && setError(e instanceof Error ? e.message : `Failed to load ${section}.`),
      );
    return () => {
      alive = false;
    };
  }, [section, valid]);

  const q = search.trim().toLowerCase();

  const companyRows = useMemo(() => {
    const rows = companies ?? [];
    if (!q) return rows;
    return rows.filter((c) =>
      `${c.name} ${c.sector_name ?? ''} ${c.jurisdiction ?? ''}`.toLowerCase().includes(q),
    );
  }, [companies, q]);

  const userGroups = useMemo(
    () =>
      groupByCompany(
        (users ?? []).filter(
          (u) => !q || `${u.full_name} ${u.email} ${u.company_name}`.toLowerCase().includes(q),
        ),
      ),
    [users, q],
  );

  const reportGroups = useMemo(
    () =>
      groupByCompany(
        (reports ?? []).filter(
          (r) => !q || `${r.title} ${r.company_name} ${r.period ?? ''}`.toLowerCase().includes(q),
        ),
      ),
    [reports, q],
  );

  // An unknown /spark/<junk> is a typo or a stale link, not an error worth a
  // screen — send it back to the overview.
  if (!valid) return <Navigate to="/spark" replace />;

  const key = section as SectionKey;
  const meta = SECTIONS[key];
  const loaded =
    key === 'users' ? users !== null : key === 'reports' ? reports !== null : companies !== null;
  const count =
    key === 'companies'
      ? companyRows.length
      : key === 'users'
        ? userGroups.reduce((n, g) => n + g.rows.length, 0)
        : reportGroups.reduce((n, g) => n + g.rows.length, 0);
  const groupCount = key === 'users' ? userGroups.length : reportGroups.length;

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="uhead">
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span className="uhead-title">{meta.listTitle}</span>
          <span className="uhead-count">{count}</span>
          {key !== 'companies' && groupCount > 0 && (
            <span style={{ fontSize: 11, color: '#9BA3C4', marginLeft: 10 }}>
              in {groupCount} {groupCount === 1 ? 'company' : 'companies'}
            </span>
          )}
        </div>
        <div style={{ position: 'relative', width: 240 }}>
          <input
            className="inp"
            placeholder={`Search ${meta.title.toLowerCase()}`}
            aria-label="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 30 }}
          />
          <svg
            viewBox="0 0 13 13"
            width="13"
            height="13"
            fill="none"
            style={{ position: 'absolute', left: 11, top: 11, color: '#9BA3C4' }}
          >
            <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.2" />
            <path d="M8.5 8.5l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {error ? (
        <div style={{ padding: 32, textAlign: 'center', fontSize: 12, color: '#5A6080' }}>
          {error}
        </div>
      ) : !loaded ? (
        <Spinner />
      ) : key === 'companies' ? (
        <CompaniesTable rows={companyRows} />
      ) : key === 'users' ? (
        <GroupedTable
          groups={userGroups}
          colSpan={4}
          unit="user"
          emptyText="No users match this search"
          head={
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last active</th>
            </tr>
          }
          renderRow={(u: SparkUserRow) => (
            <tr key={u.user_id} className="urow">
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <Tile seed={u.user_id} text={initialsOf(u.full_name)} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#1A1D2E', fontSize: 12.5 }}>
                      {u.full_name}
                    </div>
                    <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 1 }}>{u.email}</div>
                  </div>
                </div>
              </td>
              <td>
                <span className={`badge ${roleMeta(u.role).badgeClass}`}>
                  ● {roleMeta(u.role).label}
                </span>
              </td>
              <td>
                <span className={`badge ${STATUS_BADGE[u.status ?? ''] ?? 'b-gy'}`}>
                  {label(u.status)}
                </span>
              </td>
              <td style={{ color: '#5A6080' }}>
                {u.last_active ? relativeTime(u.last_active) : <Dash />}
              </td>
            </tr>
          )}
        />
      ) : (
        <GroupedTable
          groups={reportGroups}
          colSpan={4}
          unit="report"
          emptyText="No reports match this search"
          head={
            <tr>
              <th>Report</th>
              <th>Type</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          }
          renderRow={(r: SparkReportRow) => (
            <tr key={r.report_id} className="urow">
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  {/* Seeded on the type, not the id, so every quarterly report
                      shares a colour and the list reads by kind. */}
                  <Tile
                    seed={r.report_type ?? 'report'}
                    text={(r.report_type ?? 'R').slice(0, 2).toUpperCase()}
                    radius={9}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#1A1D2E', fontSize: 12.5 }}>
                      {r.title || 'Untitled report'}
                    </div>
                    {r.period && (
                      <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 1 }}>
                        {r.period}
                      </div>
                    )}
                  </div>
                </div>
              </td>
              <td style={{ color: '#5A6080' }}>{label(r.report_type)}</td>
              <td>
                <span className={`badge ${STATUS_BADGE[r.status ?? ''] ?? 'b-gy'}`}>
                  {label(r.status)}
                </span>
              </td>
              <td style={{ color: '#5A6080' }}>
                {r.created_at ? shortDateTime(r.created_at) : <Dash />}
              </td>
            </tr>
          )}
        />
      )}
    </div>
  );
}
