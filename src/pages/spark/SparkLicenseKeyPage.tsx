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
import { useNavigate, useParams } from 'react-router-dom';
import { Spinner } from '@/components/shared/Spinner';
import { FormDialog } from '@/components/subscriptions/FormDialog';
import {
  EMPTY_LIMITS, ModulesCard, UsersCard, usersSummary,
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

/** "25 users (admin included)" */
function peopleLine(limits: PlanLimits): string {
  return usersSummary(limits);
}

/** "Quarterly Report · 4 reports", or the name alone for access-only modules. */
function moduleLine(module: LicensableModule, limits: PlanLimits): string {
  if (!module.report_type) return module.label;
  return `${module.label} · ${limits.report_limits[module.report_type] ?? 1} reports`;
}

/** Upgrade only: what goes up, in plain words ("PMs 2 → 4", "Board Report added · 10 reports"). */
function upgradeChanges(form: PlanLimits, current: PlanLimits, endsAt: string, currentEnd: string,
                        catalogue: LicensableModule[]): string[] {
  const lines: string[] = [];
  if (endsAt !== currentEnd) lines.push(`End date ${formatDate(currentEnd)} → ${formatDate(endsAt)}`);
  if (form.max_users !== current.max_users) lines.push(`Users ${current.max_users} → ${form.max_users}`);
  for (const module of catalogue) {
    if (!form.modules.includes(module.key)) continue;
    if (!current.modules.includes(module.key)) {
      const reports = module.report_type ? ` · ${form.report_limits[module.report_type] ?? 1} reports` : '';
      lines.push(`${module.label} added${reports}`);
      continue;
    }
    if (!module.report_type) continue;
    const before = current.report_limits[module.report_type] ?? 1;
    const after = form.report_limits[module.report_type] ?? 1;
    if (after > before) lines.push(`${module.label} ${before} → ${after} reports`);
  }
  return lines;
}

/** Every line of the Review popup. */
export function describeChanges(mode: KeyMode, form: PlanLimits, current: PlanLimits, startsAt: string,
                                endsAt: string, currentEnd: string, catalogue: LicensableModule[]): string[] {
  if (mode === 'upgrade') return upgradeChanges(form, current, endsAt, currentEnd, catalogue);
  const lines: string[] = [];
  if (mode === 'renew') {
    lines.push(`New period ${formatDate(startsAt)} → ${formatDate(endsAt)}`, 'Report counts start again from 0');
  } else {
    lines.push(`Period ${formatDate(startsAt)} → ${formatDate(endsAt)}`);
  }
  lines.push(peopleLine(form));
  for (const module of catalogue) {
    if (form.modules.includes(module.key)) lines.push(moduleLine(module, form));
  }
  return lines;
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
  const [clientId, setClientId] = useState(row.server_id ?? '');
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
  const changes = describeChanges(mode, form, current, startsAt, endsAt, currentEnd, catalogue);

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
          {!endOk && <div className="sub-err">Not before {formatDate(earliestEnd)}</div>}
          {endOk && mode === 'upgrade' && <div className="sub-hint" style={{ marginTop: 3 }}>Not before {formatDate(currentEnd)}</div>}
        </div>
        {onPrem ? (
          <div>
            <label>
              Client ID <span style={{ color: '#9BA3C4', fontWeight: 600 }}>(from the client&apos;s License screen)</span>
              <input className="inp" style={{ fontFamily: "'DM Mono', monospace" }} placeholder="SRV-7K2M-9QXA-4T8P"
                value={clientId} readOnly={mode !== 'generate' && !!row.server_id} onChange={(e) => setClientId(e.target.value)} />
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

      <FormDialog open={reviewing} title={TITLES[mode]} onClose={closeDialog}>
        <div className="card" style={{ padding: '22px 24px', maxWidth: 460, margin: '0 auto' }}>
          {made
            ? <KeyReady company={company} made={made} onDone={backToLicenses} />
            : <ReviewChanges mode={mode} company={company} changes={changes} error={error} saving={saving}
                onBack={() => setReviewing(false)} onConfirm={makeKey} onPrem={onPrem} />}
        </div>
      </FormDialog>
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
  renew: "It starts today. Report counts start again from 0 (old reports stay). Users don't reset.",
};
const CONFIRM_LABEL: Record<KeyMode, string> = { generate: 'Generate key', upgrade: 'Upgrade', renew: 'Renew' };

function ReviewChanges({ mode, company, changes, error, saving, onBack, onConfirm, onPrem }: {
  mode: KeyMode; company: string; changes: string[]; error: string; saving: boolean;
  onBack: () => void; onConfirm: () => void; onPrem: boolean;
}) {
  const confirmLabel = onPrem ? CONFIRM_LABEL[mode] : `${CONFIRM_LABEL[mode]} and activate`;
  return (
    <>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>{REVIEW_TITLE[mode](company)}</div>
      <div style={{ fontSize: 11.5, color: '#5A6080', marginTop: 4 }}>{REVIEW_NOTE[mode]}</div>
      <ul style={{ listStyle: 'none', marginTop: 10, fontSize: 12, lineHeight: 1.9, color: '#1A1D2E' }}>
        {changes.length === 0 && <li style={{ color: '#9BA3C4' }}>Nothing changes — same as the current license.</li>}
        {changes.map((line) => <li key={line}>• {line}</li>)}
      </ul>
      {error && <div role="alert" style={{ fontSize: 12, color: '#DC2626', marginTop: 8 }}>{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
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
