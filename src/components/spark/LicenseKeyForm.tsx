// spark_admin's key form for one company. Three modes, picked from the
// company's current license (rule decided 2026-11-03):
//   - Generate: no license yet. Starts today.
//   - Upgrade:  the license is active (or not started yet). Same period, so the
//               start date stays. Nothing can go down: users, report limits
//               (unlimited stays unlimited), the modules they have, the end date.
//   - Renew:    the license has expired. A new period that starts today;
//               report counts start again from 0 (users don't reset).
// The start date is never typed. The server checks the same rules.
//
// Cloud company: the key is activated straight away (nothing to paste).
// On-premises client: the key is shown once, to copy and send to the client
// admin, who pastes it on their own server.
//
// Plan: Centriton/.claude/plans/company-licensing.md (round 20, revised)

import { useState, type FormEvent } from 'react';
import { sparkLicenses } from '@/lib/api';
import type { GeneratedLicense, LicensableModule, SparkLicenseRow } from '@/types/license';
import { CopyBox } from './CopyBox';

interface Props {
  row: SparkLicenseRow;
  modules: LicensableModule[];
  onDone: () => void;
  onCancel: () => void;
}

export type KeyFormMode = 'generate' | 'upgrade' | 'renew';

const ENDING_SOON_DAYS = 30;
const DAY_MS = 86_400_000;

function todayText(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' plus n days. */
function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Which kind of key this is, from the company's current license. */
export function modeFor(row: SparkLicenseRow): KeyFormMode {
  if (row.status === 'none' || row.status === 'invalid' || !row.starts_at) return 'generate';
  if (row.status === 'expired') return 'renew';
  return 'upgrade';
}

// Report numbers as typed in the form: '' = unlimited.
function initialLimits(row: SparkLicenseRow): Record<string, string> {
  const limits: Record<string, string> = {};
  for (const [type, value] of Object.entries(row.report_limits ?? {})) limits[type] = value == null ? '' : String(value);
  return limits;
}

const SMALL_ERROR = { display: 'block', fontSize: 11, fontWeight: 600, color: '#DC2626', marginTop: 3 } as const;
const MONO = { fontFamily: "'DM Mono', monospace" } as const;

export function LicenseKeyForm({ row, modules, onDone, onCancel }: Props) {
  const mode = modeFor(row);
  const today = todayText();
  const isOnPrem = row.deployment === 'on_prem';
  const startsAt = mode === 'upgrade' ? (row.starts_at as string) : today;
  const [expiresAt, setExpiresAt] = useState(mode === 'upgrade' ? (row.expires_at as string) : addDays(today, 364));
  // A client's open request fills the form in (Spark can still change it).
  const asked = row.open_request?.asked ?? null;
  const [maxSeats, setMaxSeats] = useState(String(asked?.max_seats ?? row.max_seats ?? Math.max(row.seats_used ?? 1, 1)));
  const [serverId, setServerId] = useState(row.server_id ?? '');
  const [chosen, setChosen] = useState<string[]>([...(row.modules ?? []), ...(asked?.modules ?? []).filter((m) => !row.modules?.includes(m))]);
  const [limits, setLimits] = useState<Record<string, string>>(() => {
    const start = initialLimits(row);
    for (const [type, number] of Object.entries(asked?.report_limits ?? {})) start[type] = String(number);
    return start;
  });
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<GeneratedLicense | null>(null);

  const had = new Set(mode === 'generate' ? [] : row.modules);
  const company = row.company_name ?? 'this company';

  // ── Checks ──
  // Users: an upgrade can't go below the current maximum; any mode can't go
  // below the users the company has now.
  const seatsFloor = Math.max(row.seats_used ?? 0, mode === 'upgrade' ? (row.max_seats ?? 0) : 0);
  const seatsFloorReason = mode === 'upgrade' && (row.max_seats ?? 0) >= (row.seats_used ?? 0) ? 'now' : 'users now';
  const seatsTooLow = maxSeats !== '' && seatsFloor > 0 && Number(maxSeats) < seatsFloor;
  const seatsMissing = maxSeats === '' || Number(maxSeats) < 1;
  const endTooEarly = expiresAt <= startsAt;
  const endBeforeCurrent = mode === 'upgrade' && !!row.expires_at && expiresAt < row.expires_at;
  // A report limit in an upgrade: never below the current limit (nor below
  // what's used); unlimited stays unlimited. Renew / generate: no minimum.
  const limitProblem = (reportType: string): string | null => {
    if (mode !== 'upgrade') return null;
    const typed = limits[reportType] ?? '';
    if (typed === '') return null;                  // unlimited is always more
    const current = row.report_limits?.[reportType];
    const hadIt = row.modules.some((key) => modules.find((m) => m.key === key)?.report_type === reportType);
    if (hadIt && current == null) return 'Already unlimited';
    const floor = Math.max(current ?? 0, row.reports_used?.[reportType] ?? 0);
    return Number(typed) < floor ? `Min ${floor} (now)` : null;
  };
  const anyError = seatsTooLow || seatsMissing || endTooEarly || endBeforeCurrent || modules.some(
    (module) => !!module.report_type && chosen.includes(module.key) && limitProblem(module.report_type) != null);

  // ── What changes, in plain words (the footer count and the confirm step) ──
  const changes: string[] = [];
  if (mode === 'renew') changes.push(`New period ${formatDate(startsAt)} → ${formatDate(expiresAt)}`);
  if (mode === 'upgrade' && expiresAt !== row.expires_at) changes.push(`End date ${formatDate(row.expires_at as string)} → ${formatDate(expiresAt)}`);
  if (mode !== 'generate' && (mode === 'renew' || Number(maxSeats) !== row.max_seats)) {
    // Users never reset: the number is a total, including who's there now.
    const now = row.seats_used;
    changes.push(now != null && maxSeats !== ''
      ? `Users: ${maxSeats} in total (${now} now, ${Math.max(Number(maxSeats) - now, 0)} more can be added)`
      : `Users: ${row.max_seats ?? '—'} → ${maxSeats}`);
  }
  for (const module of modules) {
    const on = chosen.includes(module.key);
    const typed = module.report_type ? (limits[module.report_type] ?? '') : '';
    if (mode === 'generate') {
      if (on) changes.push(`${module.label}${module.report_type ? ` ${typed || '∞'}` : ''}`);
      continue;
    }
    if (on && !had.has(module.key)) changes.push(`Add ${module.label}${module.report_type ? ` ${typed || '∞'}` : ''}`);
    else if (!on && had.has(module.key)) changes.push(`Remove ${module.label}`);
    else if (on && module.report_type && mode === 'renew') {
      changes.push(`${module.label}: ${typed ? `${typed} new reports` : 'unlimited'} this period`);
    }
    else if (on && module.report_type) {
      const before = row.report_limits?.[module.report_type];
      const after = typed === '' ? null : Number(typed);
      if ((before ?? null) !== after) changes.push(`${module.label} ${before ?? '∞'} → ${typed || '∞'}`);
    }
  }
  if (mode === 'generate') changes.unshift(`Period ${formatDate(startsAt)} → ${formatDate(expiresAt)}`, `Users ${maxSeats || '—'}`);
  const removed = modules.filter((module) => had.has(module.key) && !chosen.includes(module.key)).map((module) => module.label);
  const daysLeft = row.expires_at ? Math.round((Date.parse(row.expires_at) - Date.parse(today)) / DAY_MS) : null;

  const toggleModule = (key: string) =>
    setChosen((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (anyError) return;
    setSaving(true);
    setError('');
    const reportLimits: Record<string, number | null> = {};
    for (const module of modules) {
      if (!module.report_type || !chosen.includes(module.key)) continue;
      const typed = (limits[module.report_type] ?? '').trim();
      reportLimits[module.report_type] = typed === '' ? null : Number(typed);
    }
    try {
      const res = await sparkLicenses.generate(row.company_id, {
        modules: chosen,
        report_limits: reportLimits,
        max_seats: Number(maxSeats),
        starts_at: startsAt,
        expires_at: expiresAt,
        ...(isOnPrem && serverId.trim() ? { server_id: serverId.trim() } : {}),
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not make the key.');
      setStep('edit');
    } finally {
      setSaving(false);
    }
  };

  const title = mode === 'upgrade' ? 'Upgrade license' : mode === 'renew' ? 'Renew license' : 'Generate license key';
  const actionLabel = isOnPrem
    ? 'Generate key'
    : mode === 'upgrade' ? 'Upgrade and activate' : mode === 'renew' ? 'Renew and activate' : 'Generate and activate';

  if (result) {
    return (
      <div className="card" style={{ padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>
          {result.activated
            ? mode === 'upgrade' ? 'License upgraded' : mode === 'renew' ? 'License renewed' : `License active for ${company}`
            : `Key ready for ${company}`}
        </div>
        <div style={{ fontSize: 12, color: '#5A6080', marginTop: 6 }}>
          {result.activated
            ? 'Saved and active now. The client admins got an in-app notification.'
            : "Send this key to the client admin. They paste it in Admin → License on their own server. It's shown once — copy it now."}
        </div>
        {!result.activated && <CopyBox label="License key" value={result.license_key} />}
        <div style={{ marginTop: 14, textAlign: 'right' }}>
          <button type="button" className="btn bp" onClick={onDone}>Done</button>
        </div>
      </div>
    );
  }

  if (step === 'confirm') {
    return (
      <div className="card" style={{ padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>
          {mode === 'upgrade' ? `Upgrade ${company}'s license?` : mode === 'renew' ? `Renew ${company}'s license?` : `Generate ${company}'s license?`}
        </div>
        <div style={{ fontSize: 12, color: '#8A91AE', marginTop: 3 }}>
          {mode === 'upgrade' ? 'It replaces their current license now. Usage is kept.'
            : mode === 'renew' ? "It starts today. Report counts start again from 0 (old reports stay). Users don't reset."
            : 'It starts today.'}
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.9, marginTop: 12 }}>
          {changes.map((line) => <div key={line}>{line}</div>)}
        </div>
        {removed.length > 0 && (
          <div style={{ fontSize: 11.5, color: '#92400E', marginTop: 8 }}>{removed.join(', ')} will be hidden from {company} (not deleted).</div>
        )}
        {expiresAt < today && <div style={{ fontSize: 11.5, color: '#92400E', marginTop: 8 }}>⚠ This license will be expired as soon as you save it.</div>}
        {error && <div style={{ marginTop: 10, fontSize: 12, color: '#DC2626' }}>{error}</div>}
        <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn bs" onClick={() => setStep('edit')} disabled={saving}>Back</button>
          <button type="button" className="btn bp" onClick={() => submit()} disabled={saving}>
            {saving ? 'Saving…' : actionLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="card" style={{ padding: 20 }} onSubmit={(e) => { e.preventDefault(); if (!anyError && changes.length) setStep('confirm'); }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>{title} — {company}</div>
      {mode !== 'generate' && row.expires_at && (
        <div style={{ fontSize: 12, color: '#8A91AE', marginTop: 3 }}>
          Current: {formatDate(row.starts_at as string)} → {formatDate(row.expires_at)} ·{' '}
          {daysLeft != null && daysLeft < 0
            ? <span style={{ color: '#B91C1C', fontWeight: 700 }}>expired {-daysLeft} days ago</span>
            : `${daysLeft} days left`}
          {row.seats_used != null && ` · ${row.seats_used} of ${row.max_seats} users`}
        </div>
      )}
      {row.open_request && <RequestBox request={row.open_request} company={company} filledIn={!!asked} row={row} modules={modules} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#5A6080' }}>
          Start
          <div style={{ marginTop: 4, padding: '7px 0', fontSize: 12.5, fontWeight: 600, color: '#1A1D2E' }}>
            {mode === 'upgrade' ? `Started ${formatDate(startsAt)}` : `Today, ${formatDate(startsAt)}`}
          </div>
        </div>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#5A6080' }}>
          End
          <input className="inp" type="date" required min={mode === 'upgrade' && row.expires_at ? row.expires_at : addDays(startsAt, 1)} value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            style={{ width: '100%', marginTop: 4, ...(endTooEarly || endBeforeCurrent ? { borderColor: '#DC2626' } : {}) }} />
          {endTooEarly && <span style={SMALL_ERROR}>After start</span>}
          {!endTooEarly && endBeforeCurrent && <span style={SMALL_ERROR}>Not before {formatDate(row.expires_at as string)}</span>}
        </label>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#5A6080' }}>
          Max users (total)
          <input className="inp" inputMode="numeric" required aria-label="Users" value={maxSeats}
            onChange={(e) => setMaxSeats(e.target.value.replace(/[^0-9]/g, ''))}
            style={{ width: '100%', marginTop: 4, ...(seatsTooLow || seatsMissing ? { borderColor: '#DC2626' } : {}) }} />
          {seatsTooLow && <span style={SMALL_ERROR}>Min {seatsFloor} ({seatsFloorReason})</span>}
          {asked?.max_seats != null && <AskedNote matches={Number(maxSeats) === asked.max_seats} text={`Asked for ${asked.max_seats}`} />}
          {!seatsTooLow && row.seats_used != null && (
            <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#9BA3C4', marginTop: 3 }}>
              {row.seats_used} already have an account — at least {seatsFloor}
            </span>
          )}
        </label>
      </div>

      {mode === 'renew' && (
        <span style={{ display: 'block', fontSize: 11, color: '#9BA3C4', marginTop: 8 }}>
          New period from today: <b>report counts start again from 0</b> (old reports stay and can still be opened).{' '}
          <b>Users don't reset</b>{row.seats_used != null ? ` — ${company} keeps its ${row.seats_used} users` : ''}.
        </span>
      )}
      {mode === 'upgrade' && daysLeft != null && daysLeft <= ENDING_SOON_DAYS && (
        <span style={{ display: 'block', fontSize: 11, color: '#9BA3C4', marginTop: 8 }}>
          Renewal opens when it expires on {formatDate(row.expires_at as string)}. To avoid a gap, move the end date later — counts carry on.
        </span>
      )}
      {expiresAt < today && !endTooEarly && (
        <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#92400E', marginTop: 8 }}>
          ⚠ This license will be expired as soon as you save it.
        </span>
      )}

      {isOnPrem && (
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#5A6080', marginTop: 12 }}>
          Server ID (from the client admin's License screen)
          <input className="inp" required placeholder="SRV-7K2M-9QXA-4T8P" value={serverId} onChange={(e) => setServerId(e.target.value)} style={{ width: '100%', marginTop: 4, ...MONO }} />
        </label>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginTop: 16 }}>
        <thead>
          <tr style={{ textAlign: 'left', fontSize: 10.5, color: '#9BA3C4' }}>
            <th style={{ paddingBottom: 6 }}>Module</th>
            {mode !== 'generate' && (
              <th style={{ paddingBottom: 6, textAlign: 'right' }}>
                {mode === 'renew' ? 'Last period: used / limit' : 'Used this period / limit'}
              </th>
            )}
            <th style={{ paddingBottom: 6, textAlign: 'right' }}>New limit</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {modules.map((module) => {
            const on = chosen.includes(module.key);
            const reportType = module.report_type;
            const used = reportType ? row.reports_used?.[reportType] : undefined;
            const before = reportType ? row.report_limits?.[reportType] : undefined;
            const problem = reportType && on ? limitProblem(reportType) : null;
            // An upgrade can't remove a module they already have.
            const locked = mode === 'upgrade' && had.has(module.key);
            const askedLimit = reportType ? asked?.report_limits?.[reportType] : undefined;
            const askedToAdd = !!asked?.modules?.includes(module.key);
            const requested = askedLimit != null || askedToAdd;
            const typed = reportType ? (limits[reportType] ?? '') : '';
            // Small change mark: +2 / −1 / ∞ / New / Off. A renewal starts the
            // counts again, so comparing with last period's limit (+3) would
            // mislead — there only New / Off are shown.
            let mark: { text: string; color: string } | null = null;
            if (mode !== 'generate') {
              if (on && !had.has(module.key)) mark = { text: 'New', color: '#4F46E5' };
              else if (!on && had.has(module.key)) mark = { text: 'Off', color: '#DC2626' };
              else if (on && reportType && mode === 'upgrade') {
                const after = typed === '' ? null : Number(typed);
                if ((before ?? null) !== after) {
                  if (after === null) mark = { text: '∞', color: '#16A34A' };
                  else if (before == null) mark = { text: 'limited', color: '#D97706' };
                  else mark = after > before ? { text: `+${after - before}`, color: '#16A34A' } : { text: `−${before - after}`, color: '#D97706' };
                }
              }
            }
            return (
              <tr key={module.key} style={{ borderTop: '1px solid #F1F2F7', color: on ? undefined : '#B6BBD0' }}>
                <td style={{ padding: '6px 0', ...(requested ? { boxShadow: 'inset 3px 0 0 #F59E0B', paddingLeft: 8 } : {}) }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={on} disabled={locked} onChange={() => toggleModule(module.key)}
                      title={locked ? "An upgrade can't remove a module" : undefined} />
                    {module.label}
                  </label>
                  {askedLimit != null && on && <AskedNote matches={typed === String(askedLimit)} text={`Asked for ${askedLimit}`} />}
                  {askedToAdd && askedLimit == null && <AskedNote matches={on} text="They asked to add this" />}
                  {askedToAdd && askedLimit != null && !on && <AskedNote matches={false} text="They asked to add this" />}
                </td>
                {mode !== 'generate' && (
                  <td style={{ padding: '6px 0', textAlign: 'right', color: '#8A91AE', fontSize: 12, ...MONO }}>
                    {!had.has(module.key) ? '—' : reportType ? `${used ?? '—'} / ${before ?? '∞'}` : 'on'}
                  </td>
                )}
                <td style={{ padding: '6px 0', textAlign: 'right' }}>
                  {on && reportType && (
                    <>
                      <input
                        className="inp"
                        inputMode="numeric"
                        placeholder="∞"
                        aria-label={`${module.label} max reports`}
                        value={typed}
                        onChange={(e) => setLimits((prev) => ({ ...prev, [reportType]: e.target.value.replace(/[^0-9]/g, '') }))}
                        style={{ width: 92, textAlign: 'right', padding: '5px 8px', ...MONO, ...(problem != null ? { borderColor: '#DC2626' } : {}) }}
                      />
                      {problem != null && <span style={SMALL_ERROR}>{problem}</span>}
                      {/* Same number as now: allowed, but say it isn't an upgrade. */}
                      {problem == null && mode === 'upgrade' && before != null && typed !== '' && Number(typed) === before && (
                        <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#9BA3C4', marginTop: 3 }}>
                          Same as now — enter more than {before} to upgrade
                        </span>
                      )}
                    </>
                  )}
                  {on && !reportType && <span style={{ color: '#8A91AE', fontSize: 12 }}>on</span>}
                </td>
                <td style={{ padding: '6px 0', width: 52, textAlign: 'right', fontSize: 11, fontWeight: 700, color: mark?.color }}>
                  {mark?.text}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {error && <div style={{ marginTop: 12, fontSize: 12, color: '#DC2626' }}>{error}</div>}

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #F1F2F7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12, color: '#5A6080' }}>
          {anyError ? 'Fix the red fields' : mode === 'generate' ? '' : changes.length ? `${changes.length} change${changes.length > 1 ? 's' : ''}` : 'No changes yet'}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn bs" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn bp" disabled={anyError || changes.length === 0}>Review</button>
        </div>
      </div>
    </form>
  );
}

/** "Users 21 → 23 (+2)", "Annual Report 5 → 10 (+5)", "Add Compliance Validation". */
function askedTags(asked: NonNullable<NonNullable<SparkLicenseRow['open_request']>['asked']>,
                   row: SparkLicenseRow, modules: LicensableModule[]): string[] {
  const tags: string[] = [];
  const change = (before: number | null | undefined, after: number) =>
    before != null ? `${before} → ${after} (+${after - before})` : String(after);
  if (asked.renewal) tags.push('Renew the license');
  if (asked.max_seats != null) tags.push(`Users ${change(row.max_seats, asked.max_seats)}`);
  for (const [type, number] of Object.entries(asked.report_limits ?? {})) {
    const module = modules.find((m) => m.report_type === type);
    if (!module || asked.modules?.includes(module.key)) continue;   // shown as "Add …" below
    tags.push(`${module.label} ${change(row.report_limits?.[type], number)}`);
  }
  for (const key of asked.modules ?? []) {
    const module = modules.find((m) => m.key === key);
    const limit = module?.report_type ? asked.report_limits?.[module.report_type] : undefined;
    tags.push(`Add ${module?.label ?? key}${limit != null ? ` (${limit})` : ''}`);
  }
  return tags;
}

// "Aramco asked for: …" at the top of the form while a request is open.
function RequestBox({ request, company, filledIn, row, modules }: {
  request: NonNullable<SparkLicenseRow['open_request']>; company: string; filledIn: boolean;
  row: SparkLicenseRow; modules: LicensableModule[];
}) {
  const items = request.asked ? askedTags(request.asked, row, modules)
    // No numbers: show the text as sent (the last line is the consent, shown separately).
    : request.lines.filter((line) => !line.startsWith('Confirmed by '));
  const sent = request.sent_at ? formatDate(request.sent_at.slice(0, 10)) : '';
  return (
    <div style={{ marginTop: 14, borderRadius: 10, background: 'rgba(245,158,11,.10)', padding: '10px 12px' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#92400E' }}>{company} asked for:</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
        {items.map((item) => (
          <span key={item} style={{ fontSize: 11.5, fontWeight: 600, background: '#fff', borderRadius: 999, padding: '2px 9px', color: '#1A1D2E' }}>{item}</span>
        ))}
      </div>
      <div style={{ fontSize: 11, color: '#92400E', opacity: 0.85, marginTop: 5 }}>
        Sent {sent}{request.asked_by ? ` by ${request.asked_by}` : ''} · confirmed ·{' '}
        {filledIn ? 'already filled in below — change anything you need' : 'fill it in below'}
      </div>
    </div>
  );
}

// Under a requested field: green when it matches the request, amber when not.
function AskedNote({ matches, text }: { matches: boolean; text: string }) {
  return (
    <span style={{ display: 'block', fontSize: 11, fontWeight: 700, marginTop: 3, color: matches ? '#15803D' : '#B45309' }}>
      {matches ? '✓ As asked' : text}
    </span>
  );
}
