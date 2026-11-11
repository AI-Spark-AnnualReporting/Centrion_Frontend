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
  InternalUsersPage,
  SparkCompanyRow,
  SparkReportRow,
  SparkUserRow,
} from '@/types/spark';
import type { InviteUserResponse } from '@/types/admin';
import { InviteResultModal } from '@/pages/admin/AdminUsersPage';
import { useToast } from '@/hooks/use-toast';
import { relativeTime, shortDateTime } from '@/lib/time';
import { gradientFor, initialsOf } from '@/lib/avatar';
import { titleCase as label } from '@/lib/utils';
import { SECTIONS, isSectionKey, type SectionKey } from '@/constants/spark-sections';

const PRIMARY = '#4040C8';

const STATUS_BADGE: Record<string, string> = {
  active: 'b-gn',
  invited: 'b-am',
  pending: 'b-am',
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
  searching,
  groupBadge,
}: {
  groups: Group<T>[];
  head: React.ReactNode;
  renderRow: (row: T) => React.ReactNode;
  colSpan: number;
  emptyText: string;
  unit: string;
  searching: boolean;
  // Optional extra badge after a group's count (e.g. "1 pending" on Users).
  groupBadge?: (rows: T[]) => React.ReactNode;
}) {
  // Expanded ids: every group starts collapsed so a long list of companies
  // fits on one screen (decision 2026-11-11). While a search is typed, every
  // group opens, or matches would sit hidden inside closed groups.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  if (groups.length === 0) return <EmptyState text={emptyText} />;

  return (
    <table className="utable">
      <thead>{head}</thead>
      {groups.map((g) => {
        const isCollapsed = !searching && !expanded.has(g.id);
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
                  {groupBadge?.(g.rows)}
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

// ── Internal users (Spark staff) ───────────────────────────────────────────
// Its own server-side paged list (GET /spark/internal-users), unlike the other
// sections which load everything once and filter in the browser.

const INTERNAL_PAGE_SIZE = 25;

/** One radio card in the "How should they get in?" choice. */
function AccessChoice({
  checked,
  onSelect,
  title,
  hint,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
}) {
  return (
    <label
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        border: `1.5px solid ${checked ? PRIMARY : '#E2E4F0'}`,
        background: checked ? '#F5F5FE' : '#fff',
        borderRadius: 12,
        padding: 12,
        cursor: 'pointer',
      }}
    >
      <input
        type="radio"
        name="internal-access"
        checked={checked}
        onChange={onSelect}
        style={{ marginTop: 2, accentColor: PRIMARY }}
      />
      <span>
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#1A1D2E' }}>
          {title}
        </span>
        <span style={{ display: 'block', fontSize: 11, color: '#5A6080', marginTop: 2 }}>
          {hint}
        </span>
      </span>
    </label>
  );
}

/** Popup that creates one spark_internal account from a name and an email. */
function AddInternalUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (res: InviteUserResponse) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  // 'invite' = temp password by email (default); 'password' = the Spark admin types it.
  const [mode, setMode] = useState<'invite' | 'password'>('invite');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const usesOwnPassword = mode === 'password';

  const submit = async () => {
    if (busy) return;
    setErr('');
    if (!fullName.trim()) return setErr('Full name is required');
    if (!/.+@.+\..+/.test(email)) return setErr('A valid email is required');
    if (usesOwnPassword && password.length < 8) {
      return setErr('Password must be at least 8 characters');
    }
    setBusy(true);
    try {
      const body: { full_name: string; email: string; password?: string } = {
        full_name: fullName.trim(),
        email: email.trim(),
      };
      if (usesOwnPassword) body.password = password;
      const res = await spark.createInternalUser(body);
      onCreated(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to add internal user.');
      setBusy(false);
    }
  };

  return (
    // No background click-to-close: it would throw away a half-filled form.
    <div className="modal-overlay">
      <div className="modal-content" style={{ width: 440 }} role="dialog" aria-label="Add internal user">
        <div
          style={{
            padding: '20px 24px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 800, color: '#1A1D2E' }}>Add internal user</div>
          <button
            onClick={onClose}
            aria-label="Close"
            type="button"
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: '1.5px solid #E2E4F0',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: '4px 24px 8px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="fl">
            <label className="fl-label" htmlFor="internal-full-name">Full name</label>
            <input
              id="internal-full-name"
              className="inp"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Sara Haddad"
            />
          </div>
          <div className="fl">
            <label className="fl-label" htmlFor="internal-email">Email</label>
            <input
              id="internal-email"
              className="inp"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@wearespark.me"
            />
          </div>
          <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <legend className="fl-label" style={{ padding: 0, marginBottom: 6 }}>
              How should they get in?
            </legend>
            <AccessChoice
              checked={!usesOwnPassword}
              onSelect={() => setMode('invite')}
              title="Send invite email"
              hint="A temporary password is emailed. They change it on first login."
            />
            <AccessChoice
              checked={usesOwnPassword}
              onSelect={() => setMode('password')}
              title="Set password myself"
              hint="No email. You type the password and give it to them."
            />
          </fieldset>

          {usesOwnPassword && (
            <div className="fl">
              <label className="fl-label" htmlFor="internal-password">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="internal-password"
                  className="inp"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  style={{ paddingRight: 64 }}
                />
                <button
                  type="button"
                  className="btn bs bsm"
                  onClick={() => setShowPassword((v) => !v)}
                  style={{ position: 'absolute', right: 5, top: 5 }}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <div style={{ fontSize: 10.5, color: '#5A6080', marginTop: 4 }}>
                At least 8 characters.
              </div>
              <div
                style={{
                  marginTop: 8,
                  padding: '8px 10px',
                  background: 'rgba(245,158,11,.1)',
                  borderRadius: 8,
                  fontSize: 11,
                  color: '#B45309',
                }}
              >
                ⚠ They won&apos;t be asked to change it. Share it with them securely. No email is sent.
              </div>
            </div>
          )}

          <div
            style={{
              padding: '8px 10px',
              background: '#F2F3FA',
              borderRadius: 8,
              fontSize: 11,
              color: '#5A6080',
            }}
          >
            ⓘ Gets Spark Internal access: can open and work inside every company.
          </div>
          {err && (
            <div style={{ fontSize: 11, color: '#E5484D' }} role="alert">
              {err}
            </div>
          )}
        </div>
        <div
          style={{
            padding: '14px 24px 18px',
            borderTop: '1px solid #ECEEF8',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button className="btn bs" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="btn bp"
            onClick={submit}
            type="button"
            disabled={busy || !fullName.trim() || !email.trim()}
          >
            {busy ? 'Adding…' : usesOwnPassword ? 'Create user' : 'Send invite'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The "Internal users" tab: search, list, pager and the add button. */
function InternalUsersPanel({
  tabs,
  onTotal,
}: {
  tabs: React.ReactNode;
  onTotal: (total: number) => void;
}) {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchSent, setSearchSent] = useState('');
  const [data, setData] = useState<InternalUsersPage | null>(null);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [result, setResult] = useState<InviteUserResponse | null>(null);

  // Wait for a short pause in typing so we don't call the server on every key.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchSent(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let alive = true;
    setError('');
    spark
      .listInternalUsers({ page, limit: INTERNAL_PAGE_SIZE, search: searchSent || undefined })
      .then((res) => {
        if (!alive) return;
        setData(res);
        onTotal(res.total);
      })
      .catch(
        (e) => alive && setError(e instanceof Error ? e.message : 'Failed to load internal users.'),
      );
    return () => {
      alive = false;
    };
  }, [page, searchSent, reloadKey]);

  const handleCreated = (res: InviteUserResponse) => {
    setAddOpen(false);
    // Delivered → a toast is enough. Not delivered → the Spark admin has to
    // hand the password over, so show it. No temp password → the Spark admin
    // typed it themselves and already knows it.
    if (!res.temp_password) {
      toast({
        title: 'Internal user added',
        description: 'Share the password you set with them.',
        variant: 'success',
      });
    } else if (res.email_sent) {
      toast({
        title: 'Internal user added',
        description: res.email_message ?? `Invite sent to ${res.email}.`,
        variant: 'success',
      });
    } else {
      setResult(res);
    }
    setPage(1);
    setReloadKey((k) => k + 1);
  };

  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / INTERNAL_PAGE_SIZE));

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="uhead">
        {tabs}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative', width: 240 }}>
            <input
              className="inp"
              placeholder="Search internal users"
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
          <button className="btn bp" type="button" onClick={() => setAddOpen(true)}>
            + Add internal user
          </button>
        </div>
      </div>

      {error ? (
        <div style={{ padding: 32, textAlign: 'center', fontSize: 12, color: '#5A6080' }}>
          {error}
        </div>
      ) : data === null ? (
        <Spinner />
      ) : data.users.length === 0 ? (
        <EmptyState
          text={searchSent ? 'No internal users match this search' : 'No internal users yet'}
        />
      ) : (
        <table className="utable">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last active</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((u) => (
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
            ))}
          </tbody>
        </table>
      )}

      {lastPage > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            borderTop: '1px solid #ECEEF8',
            fontSize: 11.5,
            color: '#5A6080',
          }}
        >
          <span>
            Page {page} of {lastPage}
          </span>
          <button
            className="btn bs bsm"
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <button
            className="btn bs bsm"
            type="button"
            disabled={page >= lastPage}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}

      {addOpen && (
        <AddInternalUserModal onClose={() => setAddOpen(false)} onCreated={handleCreated} />
      )}
      {result && <InviteResultModal result={result} onClose={() => setResult(null)} />}
    </div>
  );
}

/** "Activate <name>?" — lets a client admin stuck on the signup email code in. */
function ActivateUserModal({
  user,
  onClose,
  onActivated,
}: {
  user: SparkUserRow;
  onClose: () => void;
  onActivated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const activate = async () => {
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      await spark.activateUser(user.user_id);
      onActivated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to activate user.');
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div
        className="modal-content"
        style={{ width: 440, padding: 24 }}
        role="dialog"
        aria-label={`Activate ${user.full_name}`}
      >
        <div style={{ fontSize: 16, fontWeight: 800, color: '#1A1D2E' }}>
          Activate {user.full_name}?
        </div>
        <div style={{ fontSize: 12.5, color: '#5A6080', marginTop: 8, lineHeight: 1.55 }}>
          <strong style={{ color: '#1A1D2E' }}>{user.email}</strong> never entered the code from the
          verification email. Activating skips the code. They log in with the password they chose at
          sign-up.
        </div>
        <div
          style={{
            marginTop: 12,
            fontSize: 11,
            color: '#5A6080',
            background: '#F2F3FA',
            borderRadius: 8,
            padding: '8px 10px',
          }}
        >
          Saved in the audit log.
        </div>
        {err && (
          <div style={{ marginTop: 10, fontSize: 11, color: '#E5484D' }} role="alert">
            {err}
          </div>
        )}
        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn bs" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn bp" type="button" onClick={activate} disabled={busy}>
            {busy ? 'Activating…' : 'Activate'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Amber "N pending" on a company row: users there wait for activation. */
function PendingBadge({ rows }: { rows: SparkUserRow[] }) {
  let waiting = 0;
  for (const u of rows) {
    if (u.awaiting_email_code) waiting += 1;
  }
  if (waiting === 0) return null;
  return (
    <span
      className="badge b-am"
      title="Signed up but never entered the email code"
      style={{ fontSize: 10 }}
    >
      {waiting} pending
    </span>
  );
}

type UsersTab = 'company' | 'internal';

/** The "Users by company" / "Internal users" switch on the Users section. */
function UsersTabs({
  value,
  onChange,
  companyCount,
  internalCount,
}: {
  value: UsersTab;
  onChange: (tab: UsersTab) => void;
  companyCount: number | null;
  internalCount: number | null;
}) {
  return (
    <div className="tabs" role="tablist" aria-label="Users" style={{ marginBottom: 0 }}>
      <button
        type="button"
        role="tab"
        aria-selected={value === 'company'}
        className={`tab ${value === 'company' ? 'act' : ''}`}
        onClick={() => onChange('company')}
      >
        Users by company{companyCount !== null ? ` (${companyCount})` : ''}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === 'internal'}
        className={`tab ${value === 'internal' ? 'act' : ''}`}
        onClick={() => onChange('internal')}
      >
        Internal users{internalCount !== null ? ` (${internalCount})` : ''}
      </button>
    </div>
  );
}

export default function SparkSectionPage() {
  const { section } = useParams<{ section: string }>();
  const [usersTab, setUsersTab] = useState<UsersTab>('company');
  const [activating, setActivating] = useState<SparkUserRow | null>(null);
  const [internalCount, setInternalCount] = useState<number | null>(null);

  // limit=1: only the total is needed for the tab label. A failure just
  // leaves the label without a number.
  useEffect(() => {
    if (section !== 'users') return;
    let alive = true;
    spark
      .listInternalUsers({ page: 1, limit: 1 })
      .then((res) => alive && setInternalCount(res.total))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [section]);
  const { toast } = useToast();

  // Flip the activated row in place: no reload, the list keeps its scroll and
  // open groups.
  const markUserActive = (userId: string) => {
    setUsers((rows) =>
      (rows ?? []).map((u) =>
        u.user_id === userId ? { ...u, status: 'active', awaiting_email_code: false } : u,
      ),
    );
  };
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

  const usersTabs =
    key === 'users' ? (
      <UsersTabs
        value={usersTab}
        onChange={setUsersTab}
        companyCount={loaded ? count : null}
        internalCount={internalCount}
      />
    ) : null;

  if (key === 'users' && usersTab === 'internal') {
    return <InternalUsersPanel tabs={usersTabs} onTotal={setInternalCount} />;
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="uhead">
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          {usersTabs ?? (
            <>
              <span className="uhead-title">{meta.listTitle}</span>
              <span className="uhead-count">{count}</span>
            </>
          )}
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
          searching={q !== ''}
          groupBadge={(rows: SparkUserRow[]) => <PendingBadge rows={rows} />}
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
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span className={`badge ${STATUS_BADGE[u.status ?? ''] ?? 'b-gy'}`}>
                    {label(u.status)}
                  </span>
                  {u.awaiting_email_code && (
                    <button
                      type="button"
                      className="btn bs bsm"
                      onClick={() => setActivating(u)}
                      aria-label={`Activate ${u.full_name}`}
                    >
                      Activate
                    </button>
                  )}
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
          searching={q !== ''}
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
      {activating && (
        <ActivateUserModal
          user={activating}
          onClose={() => setActivating(null)}
          onActivated={() => {
            markUserActive(activating.user_id);
            toast({
              title: `${activating.full_name} can now log in`,
              variant: 'success',
            });
            setActivating(null);
          }}
        />
      )}
    </div>
  );
}
