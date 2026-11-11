// spark_admin's "Make unlock code" form. The client admin reads the Lock ID
// off their red banner and sends it to Spark; the code made here only works
// for that lock on that server, once, within 7 days.

import { useState, type FormEvent } from 'react';
import { sparkLicenses } from '@/lib/api';
import type { SparkLicenseRow } from '@/types/license';
import { CopyBox } from './CopyBox';

interface Props {
  row: SparkLicenseRow;
  onDone: () => void;
}

export function UnlockCodeForm({ row, onDone }: Props) {
  const [lockId, setLockId] = useState(row.lock?.lock_id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState<{ unlock_code: string; valid_days: number } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      setCode(await sparkLicenses.unlockCode(row.company_id, { lock_id: lockId.trim() }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not make the unlock code.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card" style={{ padding: 18 }} onSubmit={submit}>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1D2E' }}>
        Make unlock code — {row.company_name}
      </div>
      {code ? (
        <>
          <div style={{ fontSize: 12, color: '#5A6080', marginTop: 6 }}>
            Send this to the client admin. They paste it in Admin → License. Works once, for {code.valid_days} days.
          </div>
          <CopyBox label="Unlock code" value={code.unlock_code} />
          <div style={{ marginTop: 14, textAlign: 'right' }}>
            <button type="button" className="btn bp" onClick={onDone}>Done</button>
          </div>
        </>
      ) : (
        <>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#5A6080', marginTop: 12 }}>
            Lock ID (from the client's red banner)
            <input className="inp" required placeholder="LCK-4F2A" value={lockId} onChange={(e) => setLockId(e.target.value)} style={{ width: '100%', marginTop: 4, fontFamily: "'DM Mono', monospace" }} />
          </label>
          {error && <div style={{ marginTop: 12, fontSize: 12, color: '#DC2626' }}>{error}</div>}
          <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn bs" onClick={onDone} disabled={saving}>Cancel</button>
            <button type="submit" className="btn bp" disabled={saving}>{saving ? 'Making…' : 'Make unlock code'}</button>
          </div>
        </>
      )}
    </form>
  );
}
