// Spark admin → Licenses (on-premises). Every on-premises client with its
// license, and where spark_admin makes license keys and unlock codes. The key
// is copied and sent to the client admin, who pastes it on their own server;
// clients are added here with "Add on-premises client". spark_admin only.
//
// Cloud companies don't use keys any more: they subscribe to a plan (Spark →
// Subscriptions / Quotes; plan: Centriton/.claude/plans/cloud-subscriptions.md).
// The Cloud and Upgrade requests views below stay in the code but aren't
// offered — remove them once no cloud key is left in use.
//
// Plan: Centriton/.claude/plans/company-licensing.md (round 17)

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '@/components/shared/Spinner';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { UnlockCodeForm } from '@/components/spark/UnlockCodeForm';
import { PasswordResetCodeForm } from '@/components/spark/PasswordResetCodeForm';
import { sparkLicenses } from '@/lib/api';
import type { LicensableModule, LicenseStatus, SparkLicenseRow, SparkUpgradeRequest } from '@/types/license';

const STATUS_BADGE: Record<LicenseStatus, { label: string; cls: string }> = {
  none: { label: 'No license', cls: 'b-gy' },
  active: { label: 'Active', cls: 'b-gn' },
  expired: { label: 'Expired', cls: 'b-rd' },
  not_started: { label: 'Not started', cls: 'b-am' },
  invalid: { label: 'Invalid key', cls: 'b-rd' },
  locked: { label: 'Locked', cls: 'b-rd' },
};

// Short names for the module tags, so a row with many modules stays readable.
const SHORT_MODULE_NAME: Record<string, string> = {
  quarterly_report: 'Quarterly',
  earnings_report: 'Earnings',
  annual_report: 'Annual',
  board_report: 'Board',
  esg_validator: 'ESG Validator',
  compliance_validation: 'Compliance',
  board_meetings: 'Board Meetings',
  leadership: 'Leadership',
  annual_report_validator: 'AR Validator',
};

type Tab = 'cloud' | 'on_prem' | 'requests';

// Companies split by license state, in the order they're shown. A locked
// usage record counts as locked whatever the key says.
type Group = 'active' | 'attention' | 'not_started' | 'none';
// "Ending soon" is a view of Active (ends within 30 days), not its own group:
// under "All" those companies stay in Active.
type Filter = Group | 'all' | 'soon';
const ENDING_SOON_DAYS = 30;

const GROUPS: { key: Group; label: string; dot: string }[] = [
  { key: 'active', label: 'Active', dot: '#16A34A' },
  { key: 'attention', label: 'Needs attention', dot: '#DC2626' },   // expired, locked, wrong key
  { key: 'not_started', label: 'Not started', dot: '#D97706' },
  { key: 'none', label: 'No license', dot: '#9BA3C4' },
];

export function groupOf(row: SparkLicenseRow): Group {
  if (row.lock || row.status === 'expired' || row.status === 'locked' || row.status === 'invalid') return 'attention';
  if (row.status === 'active') return 'active';
  if (row.status === 'not_started') return 'not_started';
  return 'none';
}

/** Days until the license ends (0 = today), or null with no end date. */
export function daysUntilEnd(row: SparkLicenseRow, today: string = new Date().toISOString().slice(0, 10)): number | null {
  if (!row.expires_at) return null;
  return Math.round((Date.parse(`${row.expires_at}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export function isEndingSoon(row: SparkLicenseRow): boolean {
  const days = daysUntilEnd(row);
  return groupOf(row) === 'active' && days != null && days <= ENDING_SOON_DAYS;
}

export const PAGE_SIZES = [10, 25, 50];

// New upgrade requests and keys show up without a refresh: the list reloads
// quietly this often, and as soon as the browser tab is back in view. Same
// approach as the notification bell (it polls too).
export const RELOAD_EVERY_MS = 30_000;

// ponytail: paged in the browser - the whole list is one small request (~80
// companies) and the status is worked out from each signed key, so the server
// can't filter or count by it anyway. Past ~1000 companies, store the status
// as a column and page on the server.
export function pageOf<T>(list: T[], page: number, size: number): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const current = Math.min(Math.max(page, 1), pages);
  return { items: list.slice((current - 1) * size, current * size), page: current, pages };
}

type Panel =
  | { kind: 'unlock'; row: SparkLicenseRow }
  | { kind: 'reset'; row: SparkLicenseRow }
  | null;

const MONO = { fontFamily: "'DM Mono', monospace" } as const;
const CELL = { padding: '10px 14px', verticalAlign: 'top' } as const;

function usersCell(row: SparkLicenseRow): string {
  if (row.deployment === 'on_prem') return row.max_seats != null ? `max ${row.max_seats}` : '—';
  if (row.max_seats == null) return `${row.seats_used ?? 0} / —`;
  return `${row.seats_used ?? 0} / ${row.max_seats}`;
}

/** One tag per module in the key: "Annual · 3" (3 = its report limit; no
 *  number = unlimited or a module without a count). */
export function moduleTags(row: SparkLicenseRow, modules: LicensableModule[]): string[] {
  return row.modules.map((key) => {
    const name = SHORT_MODULE_NAME[key] ?? modules.find((m) => m.key === key)?.label ?? key;
    const reportType = modules.find((m) => m.key === key)?.report_type;
    const limit = reportType ? row.report_limits?.[reportType] : null;
    return limit != null ? `${name} · ${limit}` : name;
  });
}

function ModulesCell({ row, modules }: { row: SparkLicenseRow; modules: LicensableModule[] }) {
  const tags = moduleTags(row, modules);
  if (!tags.length) return <span style={{ color: '#B6BBD0' }}>—</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 360 }}>
      {tags.map((tag) => (
        <span key={tag} style={{ fontSize: 10.5, fontWeight: 600, borderRadius: 6, padding: '2px 7px', background: '#EEF0FF', color: '#3730A3', whiteSpace: 'nowrap' }}>
          {tag}
        </span>
      ))}
    </div>
  );
}

function StatusCell({ row }: { row: SparkLicenseRow }) {
  const badge = STATUS_BADGE[row.lock ? 'locked' : row.status] ?? STATUS_BADGE.none;
  return (
    <>
      <span className={`badge ${badge.cls}`}>{badge.label}</span>
      {row.lock && <span style={{ marginLeft: 6, fontSize: 11, ...MONO }}>{row.lock.lock_id}</span>}
    </>
  );
}

function AddOnPremClient({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await sparkLicenses.addOnPremClient(name.trim());
      setName('');
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the client.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input className="inp" placeholder="On-premises client name" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 240 }} />
      <button type="button" className="btn bs" onClick={add} disabled={saving || !name.trim()}>
        {saving ? 'Adding…' : 'Add on-premises client'}
      </button>
      {error && <span style={{ fontSize: 12, color: '#DC2626' }}>{error}</span>}
    </div>
  );
}

function TabButton({ label, count, active, alert, onClick }: {
  label: string; count: number; active: boolean; alert?: boolean; onClick: () => void;
}) {
  const countStyle = alert && count > 0
    ? { background: 'rgba(245,158,11,.18)', color: '#92400E' }
    : active ? { background: '#EEF0FF', color: '#4F46E5' } : { background: '#EEF0F7', color: '#5A6080' };
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        border: 'none', background: 'none', font: 'inherit', fontSize: 13, fontWeight: 700,
        color: active ? '#4F46E5' : '#5A6080', padding: '10px 14px', cursor: 'pointer',
        borderBottom: `2px solid ${active ? '#4F46E5' : 'transparent'}`, marginBottom: -1,
        display: 'flex', alignItems: 'center', gap: 7,
      }}
    >
      {label}
      <span style={{ fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '1px 7px', ...countStyle }}>{count}</span>
    </button>
  );
}

export function Pager({ total, page, pages, size, onPage, onSize }: {
  total: number; page: number; pages: number; size: number;
  onPage: (page: number) => void;
  onSize?: (size: number) => void;    // leave out for a fixed page size (no "Rows per page")
}) {
  const from = total ? (page - 1) * size + 1 : 0;
  const to = Math.min(page * size, total);
  const pageButton = (target: number, label: string, disabled = false, on = false) => (
    <button
      key={label}
      type="button"
      disabled={disabled}
      aria-current={on ? 'page' : undefined}
      onClick={() => onPage(target)}
      style={{
        minWidth: 30, height: 30, padding: '0 8px', borderRadius: 8, fontSize: 12, fontWeight: 700,
        border: `1px solid ${on ? '#4F46E5' : '#DDE1EE'}`, background: on ? '#4F46E5' : '#fff',
        color: on ? '#fff' : '#1A1D2E', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
      }}
    >
      {label}
    </button>
  );
  const numbers = [];
  for (let n = 1; n <= pages; n++) numbers.push(pageButton(n, String(n), false, n === page));
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderTop: '1px solid #EEF0F7', fontSize: 12, color: '#5A6080' }}>
      <span>Showing <b>{from}–{to}</b> of <b>{total}</b></span>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {pageButton(page - 1, '‹ Prev', page <= 1)}
        {numbers}
        {pageButton(page + 1, 'Next ›', page >= pages)}
      </div>
      {onSize && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Rows per page
          <select value={size} onChange={(e) => onSize(Number(e.target.value))}
            style={{ border: '1px solid #DDE1EE', borderRadius: 8, padding: '5px 8px', fontSize: 12, background: '#fff' }}>
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

export function FilterChip({ label, count, dot, active, onClick }: {
  label: string; count: number; dot?: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        border: `1px solid ${active ? '#1A1D2E' : '#DDE1EE'}`, background: active ? '#1A1D2E' : '#fff',
        color: active ? '#fff' : '#5A6080', borderRadius: 999, padding: '5px 11px', fontSize: 12, fontWeight: 700,
        cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center',
      }}
    >
      {dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, display: 'inline-block' }} />}
      {label}
      <span style={{ fontSize: 11, opacity: 0.75 }}>{count}</span>
    </button>
  );
}

export default function SparkLicensesPage() {
  const [rows, setRows] = useState<SparkLicenseRow[]>([]);
  const [modules, setModules] = useState<LicensableModule[]>([]);
  const [requests, setRequests] = useState<SparkUpgradeRequest[]>([]);
  // On-premises only now (see the top of the file).
  const tab = 'on_prem' as Tab;
  const [filter, setFilter] = useState<Filter>('active');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    setLoading(true);
    sparkLicenses
      .list()
      .then((res) => {
        setRows(res.licenses);
        setModules(res.modules);
        setRequests(res.upgrade_requests ?? []);
        setError('');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load licenses.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  // Quiet reloads. Skipped while a popup is open, so nothing moves under a
  // half-filled key form; the tab, filter and page stay as they are.
  const panelOpen = useRef(false);
  panelOpen.current = panel !== null;
  useEffect(() => {
    const reloadQuietly = () => {
      if (!panelOpen.current && document.visibilityState === 'visible') load();
    };
    const timer = window.setInterval(reloadQuietly, RELOAD_EVERY_MS);
    document.addEventListener('visibilitychange', reloadQuietly);
    window.addEventListener('focus', reloadQuietly);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', reloadQuietly);
      window.removeEventListener('focus', reloadQuietly);
    };
  }, [load]);

  // The key page loads the client's current key itself.
  const openKeyPage = (row: SparkLicenseRow) => navigate(`/spark/licenses/${encodeURIComponent(row.company_id)}/key`);

  const closePanel = (reload: boolean) => {
    setPanel(null);
    if (reload) load();
  };

  if (loading && rows.length === 0) return <Spinner pad={80} />;

  const cloudRows = rows.filter((row) => row.deployment !== 'on_prem');
  const onPremRows = rows.filter((row) => row.deployment === 'on_prem');
  const tabRows = tab === 'on_prem' ? onPremRows : cloudRows;
  // One filter -> those rows; "All" -> every row, in group order (with headings).
  const filtered = filter === 'all'
    ? GROUPS.flatMap((g) => tabRows.filter((row) => groupOf(row) === g.key))
    : filter === 'soon'
      ? tabRows.filter(isEndingSoon)
      : tabRows.filter((row) => groupOf(row) === filter);
  const companyPage = pageOf(filtered, page, pageSize);
  const requestPage = pageOf(requests, page, pageSize);
  const shownPage = tab === 'requests' ? requestPage : companyPage;
  const shownTotal = tab === 'requests' ? requests.length : filtered.length;

  const switchFilter = (next: Filter) => { setFilter(next); setPage(1); };
  const groupLabel = (key: Group) => GROUPS.find((g) => g.key === key)?.label ?? key;
  const groupCount = (key: Group) => tabRows.filter((row) => groupOf(row) === key).length;

  const keyButton = (row: SparkLicenseRow, label?: string) => (
    <button type="button" className="btn bp bsm" onClick={() => openKeyPage(row)}>
      {label ?? (row.status === 'none' ? 'Generate key' : 'New key')}
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>Licenses (on-premises)</div>
          <div style={{ fontSize: 12, color: '#9BA3C4', marginTop: 2 }}>
            License keys for clients running Centriyon on their own servers. Cloud companies subscribe to a plan instead.
          </div>
        </div>
        {tab === 'on_prem' && <AddOnPremClient onAdded={load} />}
      </div>

      {tab !== 'requests' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <FilterChip label="All" count={tabRows.length} active={filter === 'all'} onClick={() => switchFilter('all')} />
          {GROUPS.map((g) => (
            <Fragment key={g.key}>
              <FilterChip label={g.label} dot={g.dot} count={groupCount(g.key)}
                active={filter === g.key} onClick={() => switchFilter(g.key)} />
              {g.key === 'active' && (
                <FilterChip label="Ending soon" dot="#2563EB" count={tabRows.filter(isEndingSoon).length}
                  active={filter === 'soon'} onClick={() => switchFilter('soon')} />
              )}
            </Fragment>
          ))}
        </div>
      )}

      {error && <div className="card" style={{ padding: 14, fontSize: 12, color: '#DC2626' }}>{error}</div>}

      {/* The forms open as a popup. A click outside it does NOT close it (a
          half-filled key form or a key shown once must not vanish by accident):
          only ✕, Cancel / Done, or Esc. ✕ reloads the list, since a key may
          already have been made. */}
      <Dialog open={panel !== null} onOpenChange={(open) => { if (!open) closePanel(true); }}>
        <DialogContent
          className="left-0 right-0 top-[4vh] mx-auto translate-x-0 translate-y-0 max-w-4xl max-h-[92vh] overflow-y-auto border-0 bg-transparent p-0 shadow-none"
          onInteractOutside={(event) => event.preventDefault()}
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">
            {panel?.kind === 'unlock' ? 'Unlock code' : 'Password reset code'}
            {panel ? ` — ${panel.row.company_name}` : ''}
          </DialogTitle>
          {panel?.kind === 'unlock' && <UnlockCodeForm row={panel.row} onDone={() => closePanel(true)} />}
          {panel?.kind === 'reset' && <PasswordResetCodeForm row={panel.row} onDone={() => closePanel(false)} />}
        </DialogContent>
      </Dialog>

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        {tab === 'requests' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#5A6080', fontSize: 11 }}>
                <th style={CELL}>Company</th>
                <th style={CELL}>What they asked for</th>
                <th style={CELL}>Asked by</th>
                <th style={CELL}>Sent</th>
                <th style={{ ...CELL, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 && (
                <tr><td colSpan={5} style={{ ...CELL, color: '#9BA3C4' }}>No open upgrade requests.</td></tr>
              )}
              {requestPage.items.map((request) => {
                const row = rows.find((r) => r.company_id === request.company_id);
                return (
                  <tr key={`${request.company_id}-${request.sent_at}`} style={{ borderTop: '1px solid #EEF0F7' }}>
                    <td style={{ ...CELL, fontWeight: 700, color: '#1A1D2E' }}>{request.company_name}</td>
                    <td style={{ ...CELL, lineHeight: 1.55 }}>
                      {request.lines.map((line) => <div key={line}>{line}</div>)}
                    </td>
                    <td style={CELL}>{request.asked_by ?? '—'}</td>
                    <td style={CELL}>{request.sent_at?.slice(0, 10) ?? '—'}</td>
                    <td style={{ ...CELL, textAlign: 'right' }}>{row && keyButton(row, 'Make new key')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#5A6080', fontSize: 11 }}>
                <th style={CELL}>{tab === 'on_prem' ? 'Client' : 'Company'}</th>
                {tab === 'on_prem' && <th style={CELL}>Client ID</th>}
                <th style={CELL}>Status</th>
                <th style={CELL}>Users</th>
                <th style={CELL}>Modules</th>
                <th style={CELL}>Ends</th>
                <th style={{ ...CELL, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {companyPage.items.length === 0 && (
                <tr><td colSpan={7} style={{ ...CELL, color: '#9BA3C4' }}>No companies here.</td></tr>
              )}
              {companyPage.items.map((row, index) => {
                // "All": a heading where a new group starts on this page
                // (its number is for the whole group, not just this page).
                const group = groupOf(row);
                const startsGroup = filter === 'all' && (index === 0 || groupOf(companyPage.items[index - 1]) !== group);
                return (
                <Fragment key={row.company_id}>
                {startsGroup && (
                  <tr>
                    <td colSpan={7} style={{ padding: '8px 14px', background: '#FAFBFD', fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: '#8A91AE' }}>
                      {groupLabel(group)} · {groupCount(group)}
                    </td>
                  </tr>
                )}
                <tr style={{ borderTop: '1px solid #EEF0F7' }}>
                  <td style={{ ...CELL, fontWeight: 700, color: '#1A1D2E' }}>
                    {row.company_name}
                    {row.open_upgrade_requests > 0 && (
                      <span className="badge b-am" style={{ marginLeft: 8 }}>Upgrade requested</span>
                    )}
                  </td>
                  {tab === 'on_prem' && (
                    <td style={{ ...CELL, fontSize: 11, ...MONO }}>
                      {row.server_id ?? <span style={{ color: '#B6BBD0', fontFamily: 'inherit' }}>waiting for the client</span>}
                    </td>
                  )}
                  <td style={CELL}><StatusCell row={row} /></td>
                  <td style={{ ...CELL, ...MONO }}>{usersCell(row)}</td>
                  <td style={CELL}><ModulesCell row={row} modules={modules} /></td>
                  <td style={CELL}>
                    {row.expires_at ?? '—'}
                    {isEndingSoon(row) && (
                      <span className="badge" style={{ marginLeft: 6, background: '#EAF1FF', color: '#1D4ED8' }}>
                        {daysUntilEnd(row) === 0 ? 'ends today' : `ends in ${daysUntilEnd(row)} days`}
                      </span>
                    )}
                  </td>
                  <td style={{ ...CELL, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {/* Locked (cloud): the unlock code is the only next step — a
                        new key wouldn't clear the lock — so it's the one button.
                        On-premises locks live on the client's server, not here,
                        so for them it's always there as a small button: the
                        client admin sends the Lock ID from their red banner. */}
                    {row.lock ? (
                      <button type="button" className="btn bp bsm" onClick={() => setPanel({ kind: 'unlock', row })}>
                        Unlock code
                      </button>
                    ) : row.deployment === 'on_prem' && row.status !== 'none' && (
                      <button type="button" className="btn bs bsm" style={{ marginRight: 6 }} onClick={() => setPanel({ kind: 'unlock', row })}>
                        Unlock code
                      </button>
                    )}
                    {/* On-premises servers may have no email server, so Spark
                        can make a one-use password-reset code for a user. */}
                    {row.deployment === 'on_prem' && row.server_id && (
                      <button type="button" className="btn bs bsm" style={{ marginRight: 6 }} onClick={() => setPanel({ kind: 'reset', row })}>
                        Reset code
                      </button>
                    )}
                    {!row.lock && keyButton(row)}
                  </td>
                </tr>
                </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
        <Pager total={shownTotal} page={shownPage.page} pages={shownPage.pages} size={pageSize}
          onPage={setPage} onSize={(size) => { setPageSize(size); setPage(1); }} />
      </div>
    </div>
  );
}
