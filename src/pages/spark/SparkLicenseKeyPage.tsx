// Spark admin → Licenses → one client's license key. A full page that never
// scrolls, built like the plan editor: a top card (mode, company, start, end,
// Client ID, buttons) and the Modules, Users and Departments cards. Review
// opens a popup listing every change; making the key shows it once, to copy.
//
// Three modes, picked from the client's current key (rule decided 2026-11-03):
//   - Generate: no valid key yet. Starts today.
//   - Upgrade:  the key is active (or not started yet). Same period, so the
//               start stays. Nothing goes down: modules, reports, users, the
//               end date.
//   - Renew:    the key has expired. A new period from today; report counts
//               start again from 0. Anything may change.
// The server checks the same rules.
//
// Route: /spark/licenses/:companyId/key
// Mockup: Centrion_Frontend/.claude/mockups/license-key-editor-mockup.html
// Plan: Centriton/.claude/plans/license-key-page-and-people-checks.md

import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Spinner } from '@/components/shared/Spinner';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  EMPTY_LIMITS, ModulesCard, UsersCard,
} from '@/components/subscriptions/PlanFields';
import { sparkLicenses } from '@/lib/api';
import type { GeneratedLicense, LicensableModule, SparkLicenseRow } from '@/types/license';
import type { PlanLimits } from '@/types/subscription';

export const LICENSES_PAGE = '/spark/licenses';

export type KeyMode = 'generate' | 'upgrade' | 'renew';

const DAY_MS = 86_400_000;
const CLIENT_ID_PATTERN = /^SRV-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

const TITLES: Record<KeyMode, string> = {
  generate: 'Generate license key', upgrade: 'Upgrade license', renew: 'Renew license',
};
const REVIEW_LABELS: Record<KeyMode, string> = {
  generate: 'Review', upgrade: 'Review upgrade', renew: 'Review renewal',
};

type KeyRow = SparkLicenseRow & { modules_catalogue: LicensableModule[] };

function todayText(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' plus n days. */
function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** '2026-11-09' → '9 Nov 2026'. */
function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Which kind of key this is, from the client's current key. */
export function modeFor(row: SparkLicenseRow): KeyMode {
  if (row.status === 'none' || row.status === 'invalid' || !row.starts_at) return 'generate';
  if (row.status === 'expired') return 'renew';
  return 'upgrade';
}

/** The current key's modules, reports and users, in the cards' shape. */
export function limitsOfKey(row: SparkLicenseRow): PlanLimits {
  return {
    modules: [...row.modules],
    report_limits: { ...row.report_limits },
    max_users: row.max_seats ?? EMPTY_LIMITS.max_users,
  };
}

/** What the page starts with: the current key (upgrade, renew) or the new-plan default. */
function startingLimits(row: SparkLicenseRow, mode: KeyMode): PlanLimits {
  if (mode === 'generate') return { ...EMPTY_LIMITS, modules: [], report_limits: {} };
  return limitsOfKey(row);
}

/** "Used 3 this period" (upgrade) / "Last period: 3 used" (renew), when the count is known. */
function reportCaptions(row: KeyRow, mode: KeyMode): Record<string, string> {
  const captions: Record<string, string> = {};
  for (const module of row.modules_catalogue) {
    if (!module.report_type) continue;
    const used = row.reports_used?.[module.report_type];
    if (used != null && mode === 'upgrade') captions[module.key] = `Used ${used} this period`;
    else if (used != null && mode === 'renew') captions[module.key] = `Last period: ${used} used`;
    else captions[module.key] = 'Reports per license period';
  }
  return captions;
}

/** One row of the Review popup: "Annual Report  2 → 4 reports". */
export type ReviewRow = {
  kind: 'up' | 'add' | 'on';   // goes up (upgrade) / newly added (upgrade) / what the key gives
  icon: string;
  name: string;
  before?: string;             // upgrade only: the value now
  after: string;
  unit?: string;
};

/** "Users · 25 (admin included)" */
function usersRow(limits: PlanLimits): ReviewRow {
  return { kind: 'on', icon: '👤', name: 'Users', after: String(limits.max_users), unit: '(admin included)' };
}

/** "Quarterly Report · 4 reports", or "Access" for access-only modules. */
function moduleRow(module: LicensableModule, limits: PlanLimits, kind: ReviewRow['kind']): ReviewRow {
  const icon = kind === 'add' ? '+' : module.label.slice(0, 1);
  if (!module.report_type) return { kind, icon, name: module.label, after: 'Access' };
  return { kind, icon, name: module.label, after: String(limits.report_limits[module.report_type] ?? 1), unit: 'reports' };
}

/** Upgrade only: what goes up ("Users 2 → 4", "Board Report added · 10 reports"). */
function upgradeChanges(form: PlanLimits, current: PlanLimits, endsAt: string, currentEnd: string,
                        catalogue: LicensableModule[]): ReviewRow[] {
  const rows: ReviewRow[] = [];
  if (endsAt !== currentEnd) {
    rows.push({ kind: 'up', icon: '▲', name: 'End date', before: formatDate(currentEnd), after: formatDate(endsAt) });
  }
  if (form.max_users !== current.max_users) {
    rows.push({ kind: 'up', icon: '▲', name: 'Users', before: String(current.max_users), after: String(form.max_users) });
  }
  for (const module of catalogue) {
    if (!form.modules.includes(module.key)) continue;
    if (!current.modules.includes(module.key)) {
      rows.push(moduleRow(module, form, 'add'));
      continue;
    }
    if (!module.report_type) continue;
    const before = current.report_limits[module.report_type] ?? 1;
    const after = form.report_limits[module.report_type] ?? 1;
    if (after > before) {
      rows.push({ kind: 'up', icon: '▲', name: module.label, before: String(before), after: String(after), unit: 'reports' });
    }
  }
  return rows;
}

/** Every row of the Review popup: what changes (upgrade), or what the key gives (new, renew). */
export function describeChanges(mode: KeyMode, form: PlanLimits, current: PlanLimits,
                                endsAt: string, currentEnd: string, catalogue: LicensableModule[]): ReviewRow[] {
  if (mode === 'upgrade') return upgradeChanges(form, current, endsAt, currentEnd, catalogue);
  const rows = [usersRow(form)];
  for (const module of catalogue) {
    if (form.modules.includes(module.key)) rows.push(moduleRow(module, form, 'on'));
  }
  return rows;
}

/** "Annual Report 2 → 4 reports": a row as one line of text (for tests and screen readers). */
export function reviewRowText(row: ReviewRow): string {
  const value = row.before ? `${row.before} → ${row.after}` : row.after;
  return [row.name, value, row.unit].filter(Boolean).join(' ');
}

/** The report limits to send: one per chosen module that counts reports (at least 1). */
function reportLimitsToSend(form: PlanLimits, catalogue: LicensableModule[]): Record<string, number> {
  const limits: Record<string, number> = {};
  for (const module of catalogue) {
    if (!module.report_type || !form.modules.includes(module.key)) continue;
    limits[module.report_type] = form.report_limits[module.report_type] ?? 1;
  }
  return limits;
}

export default function SparkLicenseKeyPage() {
  const { companyId = '' } = useParams();
  const [row, setRow] = useState<KeyRow | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    sparkLicenses.get(companyId)
      .then((loaded) => { if (!cancelled) setRow(loaded); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load the license.'); });
    return () => { cancelled = true; };
  }, [companyId]);

  if (error) return <div role="alert" style={{ padding: 24, fontSize: 13, color: '#DC2626' }}>{error}</div>;
  if (!row) return <Spinner pad={80} />;
  return <KeyEditor row={row} />;
}

// Split from the page so every field starts from the loaded key.
function KeyEditor({ row }: { row: KeyRow }) {
  const navigate = useNavigate();
  // A client just added on the Licenses page brings its Client ID along.
  const passedClientId = (useLocation().state as { serverId?: string } | null)?.serverId ?? '';
  const mode = modeFor(row);
  const today = todayText();
  const onPrem = row.deployment === 'on_prem';
  const catalogue = row.modules_catalogue;
  const current = limitsOfKey(row);
  const floor = mode === 'upgrade' ? current : null;
  const startsAt = mode === 'upgrade' ? (row.starts_at as string) : today;
  const currentEnd = row.expires_at ?? '';

  const [form, setForm] = useState<PlanLimits>(() => startingLimits(row, mode));
  const [endsAt, setEndsAt] = useState(mode === 'upgrade' ? currentEnd : addDays(today, 364));
  const [clientId, setClientId] = useState(row.server_id ?? passedClientId);
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [made, setMade] = useState<GeneratedLicense | null>(null);

  const company = row.company_name ?? 'this client';
  const clientIdOk = !onPrem || CLIENT_ID_PATTERN.test(clientId.trim().toUpperCase());
  const earliestEnd = mode === 'upgrade' ? currentEnd : addDays(startsAt, 1);
  const endOk = endsAt >= earliestEnd;
  const usersOk = !floor || form.max_users >= floor.max_users;
  const ready = clientIdOk && endOk && usersOk && form.modules.length > 0;
  const changes = describeChanges(mode, form, current, endsAt, currentEnd, catalogue);

  const makeKey = async () => {
    setSaving(true);
    setError('');
    try {
      const result = await sparkLicenses.generate(row.company_id, {
        modules: [...form.modules].sort(),
        report_limits: reportLimitsToSend(form, catalogue),
        max_users: form.max_users,
        starts_at: startsAt,
        expires_at: endsAt,
        ...(onPrem ? { server_id: clientId.trim().toUpperCase() } : {}),
      });
      setMade(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not make the key.');
    } finally {
      setSaving(false);
    }
  };

  const backToLicenses = () => navigate(LICENSES_PAGE);
  // Once the key is made there's nothing left to edit here: closing goes back.
  const closeDialog = () => {
    if (saving) return;
    if (made) backToLicenses();
    else setReviewing(false);
  };
  const modulesSubtitle = mode === 'upgrade'
    ? 'An upgrade can add modules and raise reports — never lower them'
    : 'Switch a module on · reports start at 1 (never 0 or unlimited)';

  return (
    <div className="sub-ed">
      <div className="card sub-key-top">
        <div className="sub-key-who">
          <span className={`sub-key-chip ${mode}`}>{TITLES[mode]}</span>
          <b>{company}</b>
        </div>
        <div>
          <span className="sub-key-f">Start</span>
          <div className="sub-key-fixed">{mode === 'upgrade' ? `Started ${formatDate(startsAt)}` : `Today, ${formatDate(startsAt)}`}</div>
        </div>
        <div>
          <label>
            End
            <input className="inp" type="date" value={endsAt} min={earliestEnd} onChange={(e) => setEndsAt(e.target.value)} />
          </label>
          {!endOk && <div className="sub-err">Not before {formatDate(earliestEnd)}</div>}        </div>
        {onPrem ? (
          <div>
            <label>
              Client ID <span style={{ color: '#9BA3C4', fontWeight: 600 }}>(from the client&apos;s License screen)</span>
              <input className="inp" style={{ fontFamily: "'DM Mono', monospace" }} placeholder="SRV-7K2M-9QXA-4T8P"
                value={clientId} readOnly={(mode !== 'generate' && !!row.server_id) || !!passedClientId} onChange={(e) => setClientId(e.target.value)} />
            </label>
            {clientId.trim() !== '' && !clientIdOk && <div className="sub-err">Looks like SRV-XXXX-XXXX-XXXX</div>}
          </div>
        ) : <div />}
        <div className="sub-ed-btns">
          <button type="button" className="btn bs" onClick={backToLicenses}>Cancel</button>
          <button type="button" className="btn bp" disabled={!ready} onClick={() => setReviewing(true)}>{REVIEW_LABELS[mode]}</button>
        </div>
      </div>

      <div className="sub-key-cards">
        <ModulesCard value={form} onChange={setForm} catalogue={catalogue} floor={floor}
          captions={reportCaptions(row, mode)} subtitle={modulesSubtitle} />
        <div className="sub-ed-col">
          <UsersCard value={form} onChange={setForm} floor={floor} />
        </div>
      </div>

      {/* Centred in the screen (the shared FormDialog sits near the top, for long
          forms). Only ✕, Back / Done or Esc close it — never a click outside. */}
      <Dialog open={reviewing} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sub-rv max-w-[480px] max-h-[92vh] overflow-y-auto gap-0 border-0 p-0 rounded-[18px] sm:rounded-[18px]"
          onInteractOutside={(event) => event.preventDefault()} aria-describedby={undefined}>
          {made ? (
            <div style={{ padding: '22px 24px' }}>
              <DialogTitle className="sr-only">{TITLES[mode]}</DialogTitle>
              <KeyReady company={company} made={made} onDone={backToLicenses} />
            </div>
          ) : (
            <ReviewChanges mode={mode} company={company} changes={changes} error={error} saving={saving}
              onBack={() => setReviewing(false)} onConfirm={makeKey} onPrem={onPrem}
              clientId={onPrem ? clientId.trim().toUpperCase() : ''}
              period={`${formatDate(startsAt)} → ${formatDate(endsAt)}`} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const REVIEW_TITLE: Record<KeyMode, (company: string) => string> = {
  generate: (company) => `Generate ${company}'s license?`,
  upgrade: (company) => `Upgrade ${company}'s license?`,
  renew: (company) => `Renew ${company}'s license?`,
};
const REVIEW_NOTE: Record<KeyMode, string> = {
  generate: 'It starts today.',
  upgrade: 'It replaces their current license now. Usage is kept.',
  renew: 'A new period starts today.',
};
const CONFIRM_LABEL: Record<KeyMode, string> = { generate: 'Generate key', upgrade: 'Upgrade', renew: 'Renew' };

function ReviewRowLine({ row }: { row: ReviewRow }) {
  return (
    <div className="sub-rv-row" aria-label={reviewRowText(row)}>
      <span className={`sub-rv-ic ${row.kind}`} aria-hidden="true">{row.icon}</span>
      <span className="sub-rv-name">
        {row.name}
        {row.kind === 'add' && <span className="sub-rv-tag">New</span>}
      </span>
      <span className="sub-rv-val">
        {row.before && <>{row.before} → </>}
        <b>{row.after}</b>
        {row.unit && <> {row.unit}</>}
      </span>
    </div>
  );
}

function ReviewChanges({ mode, company, changes, error, saving, onBack, onConfirm, onPrem, clientId, period }: {
  mode: KeyMode; company: string; changes: ReviewRow[]; error: string; saving: boolean;
  onBack: () => void; onConfirm: () => void; onPrem: boolean; clientId: string; period: string;
}) {
  const confirmLabel = onPrem ? CONFIRM_LABEL[mode] : `${CONFIRM_LABEL[mode]} and activate`;
  let note = REVIEW_NOTE[mode];
  if (mode === 'generate' && onPrem) note += " You'll get the key once, to copy and send to the client admin.";
  const listTitle = mode === 'upgrade' ? 'What changes' : 'What the key gives';
  return (
    <>
      <div className="sub-rv-head">
        <span className={`sub-key-chip ${mode}`}>{TITLES[mode]}</span>
        <DialogTitle className="sub-rv-title">{REVIEW_TITLE[mode](company)}</DialogTitle>
        <div className="sub-rv-note">{note}</div>
      </div>
      <div className="sub-rv-body">
        <dl className="sub-rv-info">
          <dt>Client</dt><dd>{company}</dd>
          {clientId && <><dt>Client ID</dt><dd className="mono">{clientId}</dd></>}
          <dt>Period</dt><dd>{period}</dd>
        </dl>
        {mode === 'renew' && (
          <div className="sub-rv-warn">Report counts start again from 0 (old reports stay). Users don&apos;t reset.</div>
        )}
        <div>
          <div className="sub-rv-sec">{listTitle} · {changes.length}</div>
          <div className="sub-rv-list">
            {changes.length === 0 && <div className="sub-rv-empty">Nothing changes — same as the current license.</div>}
            {changes.map((row) => <ReviewRowLine key={row.name} row={row} />)}
          </div>
        </div>
        {error && <div role="alert" className="sub-rv-error">{error}</div>}
      </div>
      <div className="sub-rv-foot">
        <button type="button" className="btn bs" onClick={onBack} disabled={saving}>Back</button>
        <button type="button" className="btn bp" onClick={onConfirm} disabled={saving}>{saving ? 'Saving…' : confirmLabel}</button>
      </div>
    </>
  );
}

function KeyReady({ company, made, onDone }: { company: string; made: GeneratedLicense; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(made.license_key);
      setCopied(true);
    } catch {
      // Clipboard blocked (e.g. not https): the key can still be selected in the box.
    }
  };
  if (made.activated) {
    return (
      <>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>✓ License active for {company}</div>
        <div style={{ fontSize: 11.5, color: '#5A6080', marginTop: 4 }}>Saved and active now. The client admins got an in-app notification.</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" className="btn bp" onClick={onDone}>Done — back to Licenses</button>
        </div>
      </>
    );
  }
  return (
    <>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>✓ Key ready for {company}</div>
      <div style={{ fontSize: 11.5, color: '#5A6080', marginTop: 4 }}>
        Send this key to the client admin. They paste it in Admin → License on their own server. It&apos;s shown once — copy it now.
      </div>
      <div className="sub-key-copy" aria-label="License key">{made.license_key}</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <button type="button" className="btn bs" onClick={copy}>{copied ? 'Copied' : 'Copy key'}</button>
        <button type="button" className="btn bp" onClick={onDone}>Done — back to Licenses</button>
      </div>
    </>
  );
}
