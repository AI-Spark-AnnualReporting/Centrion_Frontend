// The client admin's License card (Admin Console → Overview).
//
// Shows the license, users used / max, and reports used / limit per type.
// Cloud: a "Request upgrade" button (Spark makes the new key).
// On-premises: the Server ID to send to Spark, and boxes to paste the license
// key and unlock codes Spark sends back. The admin can never make a key.
//
// Plan: Centriton/.claude/plans/company-licensing.md

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { CopyBox } from '@/components/spark/CopyBox';
import { useAuth } from '@/context/AuthContext';
import { license } from '@/lib/api';
import { LICENSE_CARD_ID, LICENSE_KEY_BOX_ID, LICENSE_UNLOCK_BOX_ID } from '@/components/license/LicenseBanner';
import type { CompanyLicense, LicenseStatus } from '@/types/license';

const STATUS_TEXT: Record<LicenseStatus, { label: string; cls: string }> = {
  none: { label: 'Not active yet', cls: 'b-gy' },
  active: { label: 'Active', cls: 'b-gn' },
  expired: { label: 'Expired — read only', cls: 'b-rd' },
  not_started: { label: 'Not started yet', cls: 'b-am' },
  invalid: { label: 'Key not valid here — read only', cls: 'b-rd' },
  locked: { label: 'Locked — read only', cls: 'b-rd' },
};

function moduleLabel(data: CompanyLicense, key: string): string {
  return data.modules_catalogue.find((m) => m.key === key)?.label ?? key;
}

function reportLabel(data: CompanyLicense, reportType: string): string {
  return data.modules_catalogue.find((m) => m.report_type === reportType)?.label ?? reportType;
}

// A paste box with one button: the license key or an unlock code.
function PasteBox({
  id,
  label,
  button,
  onSubmit,
}: {
  id: string;
  label: string;
  button: string;
  onSubmit: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSubmit(value.trim());
      setValue('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#5A6080', marginBottom: 4 }}>{label}</div>
      <textarea id={id} className="inp" rows={3} required value={value} onChange={(e) => setValue(e.target.value)} style={{ width: '100%', fontFamily: "'DM Mono', monospace", fontSize: 11 }} />
      {error && <div style={{ fontSize: 12, color: '#DC2626', marginTop: 4 }}>{error}</div>}
      <div style={{ textAlign: 'right', marginTop: 6 }}>
        <button type="submit" className="btn bp bsm" disabled={saving || !value.trim()}>{saving ? 'Checking…' : button}</button>
      </div>
    </form>
  );
}

// Cloud only: ask Spark for more. Never changes the license itself.
function UpgradeRequest({ data, onSent }: { data: CompanyLicense; onSent: () => void }) {
  const [open, setOpen] = useState(false);
  const [seats, setSeats] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (data.upgrade_requested_at) {
    return <span className="badge b-am">Request sent on {data.upgrade_requested_at.slice(0, 10)}</span>;
  }
  if (!open) {
    return <button type="button" className="btn bs bsm" onClick={() => setOpen(true)}>Request upgrade</button>;
  }

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await license.requestUpgrade({
        ...(seats ? { max_seats: Number(seats) } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setOpen(false);
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the request.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={send} style={{ marginTop: 12, width: '100%' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="inp" type="number" min={1} placeholder="Users needed" value={seats} onChange={(e) => setSeats(e.target.value)} style={{ width: 130 }} />
        <input className="inp" placeholder="What else do you need? (reports, modules…)" value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: 1 }} />
      </div>
      {error && <div style={{ fontSize: 12, color: '#DC2626', marginTop: 4 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
        <button type="button" className="btn bs bsm" onClick={() => setOpen(false)}>Cancel</button>
        <button type="submit" className="btn bp bsm" disabled={saving || (!seats && !note.trim())}>{saving ? 'Sending…' : 'Send to Centriyon'}</button>
      </div>
    </form>
  );
}

export function LicenseCard() {
  const { refreshPermissions } = useAuth();
  const [data, setData] = useState<CompanyLicense | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    license.get().then(setData).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load the license.'));
  }, []);

  useEffect(load, [load]);

  // Opened from the license banner (/admin-console#license-key-box): once the
  // card is drawn, scroll to the part it asked for and put the cursor there.
  const { hash } = useLocation();
  useEffect(() => {
    if (!data || !hash) return;
    const target = document.getElementById(hash.slice(1));
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (target instanceof HTMLTextAreaElement) target.focus({ preventScroll: true });
  }, [data, hash]);

  // After a key or unlock code is accepted: show it, and refresh the login so
  // the licensed modules appear without logging out.
  const afterChange = async (next: CompanyLicense) => {
    setData(next);
    try {
      await refreshPermissions();
    } catch {
      // The card is already up to date; the sidebar catches up on next login.
    }
  };

  if (error) return <div className="card" style={{ padding: 18, fontSize: 12, color: '#DC2626' }}>{error}</div>;
  if (!data) return null;

  const status = STATUS_TEXT[data.status] ?? STATUS_TEXT.none;
  const onPrem = data.deployment === 'on_prem';

  return (
    <div id={LICENSE_CARD_ID} className="card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#1A1D2E' }}>License</span>
          <span className={`badge ${status.cls}`}>{status.label}</span>
          {data.lock_id && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>Lock ID {data.lock_id}</span>}
        </div>
        {!onPrem && data.status !== 'none' && <UpgradeRequest data={data} onSent={load} />}
      </div>

      {data.message && <div style={{ fontSize: 12, color: '#5A6080', marginTop: 8 }}>{data.message}</div>}

      {data.status !== 'none' && data.starts_at && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10, marginTop: 14 }}>
          <Usage label="Users" used={data.seats_used} limit={data.max_seats} />
          {Object.entries(data.reports_used).map(([type, used]) => (
            <Usage key={type} label={reportLabel(data, type)} used={used} limit={data.report_limits[type] ?? null} />
          ))}
          <div>
            <div style={{ fontSize: 11, color: '#9BA3C4' }}>Period</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1D2E' }}>{data.starts_at} → {data.expires_at}</div>
          </div>
        </div>
      )}

      {data.modules.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {data.modules.map((m) => <span key={m} className="badge b-or">{moduleLabel(data, m)}</span>)}
        </div>
      )}

      {onPrem && (
        <>
          {data.server_id && <CopyBox label="Server ID — send this to Centriyon" value={data.server_id} />}
          <PasteBox id={LICENSE_KEY_BOX_ID} label="License key from Centriyon" button="Activate license" onSubmit={async (key) => afterChange(await license.activate(key))} />
          {data.status === 'locked' && (
            <PasteBox id={LICENSE_UNLOCK_BOX_ID} label="Unlock code from Centriyon" button="Unlock" onSubmit={async (code) => afterChange(await license.unlock(code))} />
          )}
        </>
      )}
      {!onPrem && data.status === 'locked' && (
        <PasteBox id={LICENSE_UNLOCK_BOX_ID} label="Unlock code from Centriyon" button="Unlock" onSubmit={async (code) => afterChange(await license.unlock(code))} />
      )}
    </div>
  );
}

function Usage({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const full = limit != null && used >= limit;
  return (
    <div>
      <div style={{ fontSize: 11, color: '#9BA3C4' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: full ? '#DC2626' : '#1A1D2E' }}>
        {used} / {limit ?? '∞'}
      </div>
    </div>
  );
}
