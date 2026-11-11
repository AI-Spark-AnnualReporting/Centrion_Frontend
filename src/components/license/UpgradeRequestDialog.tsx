// The client admin's "Request upgrade" popup (cloud only). One table, like
// spark_admin's key form: each limit with what they need instead (only more),
// and modules they don't have yet added from a row of "+ Module" pills.
// "Review" shows the exact request and asks for consent; only then can it be
// sent. Opened from "Request renewal", it starts with "Renew my license"
// ticked. Like every license popup, a click outside does NOT close it.
//
// Plan: Centriton/.claude/plans/company-licensing.md (rounds 18 and 22)

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { license } from '@/lib/api';
import type { CompanyLicense, UpgradeRequestPayload } from '@/types/license';

interface Props {
  data: CompanyLicense;
  companyName: string;
  startWithRenewal?: boolean;
  onClose: () => void;
  onSent: () => void;
}

type Check = { state: 'keep' | 'ok' | 'same' | 'bad'; text?: string };

/** Blank = keep; the same number = nothing to ask; lower = not allowed. */
export function checkHigher(value: string, current: number): Check {
  if (value === '') return { state: 'keep' };
  const number = Number(value);
  if (number < current) return { state: 'bad', text: `Must be more than your current ${current}.` };
  if (number === current) return { state: 'same', text: 'Same as now — nothing to ask.' };
  return { state: 'ok' };
}

function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

function formatDate(isoDate: string | null): string {
  if (!isoDate) return '';
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function plural(count: number, word: string): string {
  return `${count} more ${word}${count === 1 ? '' : 's'}`;
}

const MONO = { fontFamily: "'DM Mono', monospace" } as const;
const CELL = { padding: '7px 0', borderTop: '1px solid #F1F2F7', verticalAlign: 'middle' } as const;
const NUMBER_BOX = { width: 96, border: '1px solid #DDE1EE', borderRadius: 8, padding: '6px 9px', fontSize: 12.5, textAlign: 'right', ...MONO } as const;
// Popups sit a fixed distance from the top, centred with auto margins (no
// translate(-50%), which blurs text on odd heights).
const CRISP = 'left-0 right-0 top-[4vh] mx-auto translate-x-0 translate-y-0';

// One limit the license already has: users, or a report type.
interface Limit { key: string; label: string; current: number; unit: string; reportType?: string }

export function UpgradeRequestDialog({ data, companyName, startWithRenewal = false, onClose, onSent }: Props) {
  // What can be asked for more of: users, and every licensed report type that
  // has a number limit (unlimited ones can't be raised).
  const limits: Limit[] = [];
  if (data.max_seats != null) limits.push({ key: 'seats', label: 'Users', current: data.max_seats, unit: 'user' });
  for (const module of data.modules_catalogue) {
    if (!module.report_type || !data.modules.includes(module.key)) continue;
    const limit = data.report_limits[module.report_type];
    if (limit == null) continue;
    limits.push({ key: module.report_type, label: module.label, current: limit, unit: 'report', reportType: module.report_type });
  }
  const addable = data.modules_catalogue.filter((module) => !data.modules.includes(module.key));

  const [renewal, setRenewal] = useState(startWithRenewal);
  const [wanted, setWanted] = useState<Record<string, string>>({});   // limit key -> typed number
  const [added, setAdded] = useState<Record<string, string>>({});     // module key -> optional limit
  const [step, setStep] = useState<'pick' | 'confirm'>('pick');
  const [agreed, setAgreed] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const checks = limits.map((limit) => checkHigher(wanted[limit.key] ?? '', limit.current));
  const anyBad = checks.some((check) => check.state === 'bad');

  // The request in plain words, for the footer count and the confirm step.
  const summary: string[] = [];
  if (renewal) summary.push(`Renew my license (ends ${formatDate(data.expires_at)})`);
  limits.forEach((limit, index) => {
    if (checks[index].state !== 'ok') return;
    const after = Number(wanted[limit.key]);
    summary.push(`${limit.label}: ${limit.current} → ${after} (+${plural(after - limit.current, limit.unit)})`);
  });
  for (const [key, number] of Object.entries(added)) {
    const label = data.modules_catalogue.find((module) => module.key === key)?.label ?? key;
    summary.push(number ? `Add ${label} (${number} reports)` : `Add ${label}`);
  }

  const payload = (): UpgradeRequestPayload => {
    const body: UpgradeRequestPayload = { consent: true };
    if (renewal) body.renewal = true;
    const reportLimits: Record<string, number> = {};
    limits.forEach((limit, index) => {
      if (checks[index].state !== 'ok') return;
      if (limit.key === 'seats') body.max_seats = Number(wanted.seats);
      else if (limit.reportType) reportLimits[limit.reportType] = Number(wanted[limit.key]);
    });
    const addedKeys = Object.keys(added);
    for (const key of addedKeys) {
      const reportType = data.modules_catalogue.find((module) => module.key === key)?.report_type;
      if (reportType && added[key]) reportLimits[reportType] = Number(added[key]);
    }
    if (Object.keys(reportLimits).length) body.report_limits = reportLimits;
    if (addedKeys.length) body.modules = addedKeys;
    return body;
  };

  const send = async () => {
    setSending(true);
    setError('');
    try {
      await license.requestUpgrade(payload());
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the request.');
    } finally {
      setSending(false);
    }
  };

  const removeModule = (key: string) =>
    setAdded((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className={`${CRISP} max-w-2xl max-h-[92vh] overflow-y-auto p-0`}
        onInteractOutside={(event) => event.preventDefault()}
        aria-describedby={undefined}
      >
        {step === 'pick' ? (
          <div style={{ padding: '20px 24px' }}>
            <DialogTitle style={{ fontSize: 15, fontWeight: 800 }}>Request upgrade</DialogTitle>
            <div style={{ fontSize: 12, color: '#8A91AE', marginTop: 3 }}>
              Current license: {formatDate(data.starts_at)} → {formatDate(data.expires_at)} · type only what you need more of
            </div>

            {startWithRenewal && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, fontSize: 12.5, fontWeight: 600 }}>
                <input type="checkbox" checked={renewal} onChange={(e) => setRenewal(e.target.checked)} />
                Renew my license (ends {formatDate(data.expires_at)})
              </label>
            )}

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginTop: 18 }}>
              <thead>
                <tr style={{ textAlign: 'left', fontSize: 10.5, color: '#9BA3C4' }}>
                  <th style={{ paddingBottom: 6 }} />
                  <th style={{ paddingBottom: 6, textAlign: 'right' }}>Current limit</th>
                  <th style={{ paddingBottom: 6, textAlign: 'right' }}>You need</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {limits.map((limit, index) => {
                  const check = checks[index];
                  const typed = wanted[limit.key] ?? '';
                  return (
                    <tr key={limit.key}>
                      <td style={CELL}>{limit.label}</td>
                      <td style={{ ...CELL, textAlign: 'right', color: '#8A91AE', fontSize: 12, ...MONO }}>{limit.current}</td>
                      <td style={{ ...CELL, textAlign: 'right' }}>
                        <input
                          aria-label={`New ${limit.label}`}
                          inputMode="numeric"
                          placeholder="—"
                          value={typed}
                          onChange={(e) => setWanted((prev) => ({ ...prev, [limit.key]: digitsOnly(e.target.value) }))}
                          style={{ ...NUMBER_BOX, ...(check.state === 'bad' ? { borderColor: '#DC2626' } : {}) }}
                        />
                        {check.state === 'bad' && (
                          <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#DC2626', marginTop: 3 }}>More than {limit.current}</span>
                        )}
                      </td>
                      <td style={{ ...CELL, width: 54, textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#16A34A' }}>
                        {check.state === 'ok' ? `+${Number(typed) - limit.current}` : ''}
                      </td>
                    </tr>
                  );
                })}
                {Object.keys(added).map((key) => {
                  const module = data.modules_catalogue.find((m) => m.key === key);
                  return (
                    <tr key={key}>
                      <td style={CELL}>
                        {module?.label ?? key}
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#4F46E5', background: '#EEF0FF', borderRadius: 6, padding: '1px 6px', marginLeft: 6 }}>NEW</span>
                      </td>
                      <td style={{ ...CELL, textAlign: 'right', color: '#8A91AE' }}>—</td>
                      <td style={{ ...CELL, textAlign: 'right' }}>
                        {module?.report_type && (
                          <input
                            aria-label={`${module.label} reports`}
                            inputMode="numeric"
                            placeholder="reports"
                            value={added[key]}
                            onChange={(e) => setAdded((prev) => ({ ...prev, [key]: digitsOnly(e.target.value) }))}
                            style={NUMBER_BOX}
                          />
                        )}
                      </td>
                      <td style={{ ...CELL, width: 54, textAlign: 'right' }}>
                        <button type="button" aria-label={`Remove ${module?.label ?? key}`} onClick={() => removeModule(key)}
                          style={{ border: 'none', background: 'none', color: '#9BA3C4', cursor: 'pointer', fontSize: 13 }}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {addable.length > 0 && (
              <>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9BA3C4', marginTop: 16 }}>ADD A MODULE</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7 }}>
                  {addable.filter((module) => !(module.key in added)).map((module) => (
                    <button
                      key={module.key}
                      type="button"
                      onClick={() => setAdded((prev) => ({ ...prev, [module.key]: '' }))}
                      style={{ border: '1px dashed #C9CEE0', background: '#fff', borderRadius: 999, padding: '4px 11px', fontSize: 12, fontWeight: 600, color: '#5A6080', cursor: 'pointer' }}
                    >
                      + {module.label}
                    </button>
                  ))}
                  {addable.every((module) => module.key in added) && (
                    <span style={{ fontSize: 12, color: '#9BA3C4' }}>All modules added.</span>
                  )}
                </div>
              </>
            )}

            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #F1F2F7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: '#5A6080' }}>
                {anyBad ? 'Fix the red number' : summary.length ? `${summary.length} change${summary.length > 1 ? 's' : ''}` : 'Nothing asked yet'}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn bs bsm" onClick={onClose}>Cancel</button>
                <button type="button" className="btn bp bsm" disabled={!summary.length || anyBad}
                  onClick={() => { setAgreed(false); setStep('confirm'); }}>
                  Review
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '20px 24px' }}>
            <DialogTitle style={{ fontSize: 15, fontWeight: 800 }}>Send this request to Centriyon?</DialogTitle>
            <div style={{ fontSize: 12, color: '#8A91AE', marginTop: 3 }}>Nothing changes until Centriyon sends you a new license.</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.9, marginTop: 12 }}>
              {summary.map((line) => <div key={line}>• {line}</div>)}
            </div>
            <ul style={{ fontSize: 12, color: '#5A6080', lineHeight: 1.6, margin: '12px 0 0', paddingLeft: 18 }}>
              <li>Centriyon will contact you about the change to your agreement and price.</li>
              <li>One request at a time; it stays open until Centriyon answers.</li>
            </ul>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12.5, fontWeight: 600, padding: '10px 12px', border: '1px solid #DDE1EE', borderRadius: 10, cursor: 'pointer', marginTop: 14 }}>
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 2 }} />
              <span>I confirm I'm allowed to request this for <b>{companyName}</b>, and I understand it may change our agreement and price.</span>
            </label>
            {error && <div style={{ fontSize: 12, color: '#DC2626', marginTop: 10 }}>{error}</div>}
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #F1F2F7', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn bs bsm" onClick={() => setStep('pick')} disabled={sending}>Back</button>
              <button type="button" className="btn bp bsm" disabled={!agreed || sending} onClick={send}>
                {sending ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
