// spark_admin's "Generate key" form for one company.
//
// Cloud company: the key is activated straight away (nothing to paste).
// On-premises client: the key is shown once, to copy and send to the client
// admin, who pastes it on their own server. The form starts from the
// company's current license, so an upgrade only changes what's different.

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

// One year from today, as YYYY-MM-DD — the usual license period.
function defaultDates(): { start: string; end: string } {
  const today = new Date();
  const end = new Date(today);
  end.setFullYear(end.getFullYear() + 1);
  end.setDate(end.getDate() - 1);
  return { start: today.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

// Report numbers as typed in the form: '' = unlimited.
function initialLimits(row: SparkLicenseRow): Record<string, string> {
  const limits: Record<string, string> = {};
  for (const [type, value] of Object.entries(row.report_limits ?? {})) limits[type] = String(value);
  return limits;
}

export function LicenseKeyForm({ row, modules, onDone, onCancel }: Props) {
  const dates = defaultDates();
  const isOnPrem = row.deployment === 'on_prem';
  const [startsAt, setStartsAt] = useState(row.starts_at ?? dates.start);
  const [expiresAt, setExpiresAt] = useState(row.expires_at ?? dates.end);
  const [maxSeats, setMaxSeats] = useState(String(row.max_seats ?? Math.max(row.seats_used ?? 1, 1)));
  const [serverId, setServerId] = useState(row.server_id ?? '');
  const [chosen, setChosen] = useState<string[]>(row.modules ?? []);
  const [limits, setLimits] = useState<Record<string, string>>(initialLimits(row));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<GeneratedLicense | null>(null);

  const toggleModule = (key: string) =>
    setChosen((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
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
    } finally {
      setSaving(false);
    }
  };

  if (result) {
    return (
      <div className="card" style={{ padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1D2E' }}>
          {result.activated ? `License active for ${row.company_name}` : `Key ready for ${row.company_name}`}
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

  return (
    <form className="card" style={{ padding: 18 }} onSubmit={submit}>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1D2E' }}>
        Generate license key — {row.company_name}
        <span className={`badge ${isOnPrem ? 'b-pp' : 'b-bl'}`} style={{ marginLeft: 8 }}>
          {isOnPrem ? 'On-premises' : 'Cloud'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 14 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#5A6080' }}>
          Start date
          <input className="inp" type="date" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} style={{ width: '100%', marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#5A6080' }}>
          End date
          <input className="inp" type="date" required value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} style={{ width: '100%', marginTop: 4 }} />
        </label>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#5A6080' }}>
          Max users {row.seats_used != null && <span style={{ fontWeight: 400 }}>({row.seats_used} now)</span>}
          <input className="inp" type="number" min={1} required value={maxSeats} onChange={(e) => setMaxSeats(e.target.value)} style={{ width: '100%', marginTop: 4 }} />
        </label>
      </div>

      {isOnPrem && (
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#5A6080', marginTop: 12 }}>
          Server ID (from the client admin's License screen)
          <input className="inp" required placeholder="SRV-7K2M-9QXA-4T8P" value={serverId} onChange={(e) => setServerId(e.target.value)} style={{ width: '100%', marginTop: 4, fontFamily: "'DM Mono', monospace" }} />
        </label>
      )}

      <div style={{ fontSize: 11, fontWeight: 700, color: '#5A6080', marginTop: 16 }}>
        Modules and report limits <span style={{ fontWeight: 400 }}>(blank number = unlimited)</span>
      </div>
      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {modules.map((module) => {
          const on = chosen.includes(module.key);
          const reportType = module.report_type;
          const used = reportType ? row.reports_used?.[reportType] : undefined;
          return (
            <div key={module.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, width: 220 }}>
                <input type="checkbox" checked={on} onChange={() => toggleModule(module.key)} />
                {module.label}
              </label>
              {reportType && on && (
                <>
                  <input
                    className="inp"
                    type="number"
                    min={0}
                    placeholder="Unlimited"
                    aria-label={`${module.label} max reports`}
                    value={limits[reportType] ?? ''}
                    onChange={(e) => setLimits((prev) => ({ ...prev, [reportType]: e.target.value }))}
                    style={{ width: 110 }}
                  />
                  {used != null && <span style={{ fontSize: 11, color: '#9BA3C4' }}>{used} used</span>}
                </>
              )}
            </div>
          );
        })}
      </div>

      {error && <div style={{ marginTop: 12, fontSize: 12, color: '#DC2626' }}>{error}</div>}

      <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn bs" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn bp" disabled={saving}>
          {saving ? 'Generating…' : isOnPrem ? 'Generate key' : 'Generate and activate'}
        </button>
      </div>
    </form>
  );
}
