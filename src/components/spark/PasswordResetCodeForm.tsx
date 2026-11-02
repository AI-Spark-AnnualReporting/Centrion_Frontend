// spark_admin's "Make password-reset code" form, for an on-premises client
// with no email server whose user can't reset their password any other way.
// The code works only on that client's server, for that email, once, within
// 24 hours. The user enters it at /reset-with-code on their own server.

import { useState, type FormEvent } from 'react';
import { sparkLicenses } from '@/lib/api';
import type { SparkLicenseRow } from '@/types/license';
import { CopyBox } from './CopyBox';

interface Props {
  row: SparkLicenseRow;
  onDone: () => void;
}

export function PasswordResetCodeForm({ row, onDone }: Props) {
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState<{ reset_code: string; valid_hours: number } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      setCode(await sparkLicenses.passwordResetCode(row.company_id, email.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not make the reset code.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card" style={{ padding: 18 }} onSubmit={submit}>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1D2E' }}>
        Password-reset code — {row.company_name}
      </div>
      {code ? (
        <>
          <div style={{ fontSize: 12, color: '#5A6080', marginTop: 6 }}>
            Send this to {email}. They open "Forgot password → Use a reset code from Spark" on their server.
            Works once, for {code.valid_hours} hours.
          </div>
          <CopyBox label="Reset code" value={code.reset_code} />
          <div style={{ marginTop: 14, textAlign: 'right' }}>
            <button type="button" className="btn bp" onClick={onDone}>Done</button>
          </div>
        </>
      ) : (
        <>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#5A6080', marginTop: 12 }}>
            User's email on the client's server
            <input className="inp" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', marginTop: 4 }} />
          </label>
          {error && <div style={{ marginTop: 12, fontSize: 12, color: '#DC2626' }}>{error}</div>}
          <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn bs" onClick={onDone} disabled={saving}>Cancel</button>
            <button type="submit" className="btn bp" disabled={saving || !email.trim()}>{saving ? 'Making…' : 'Make reset code'}</button>
          </div>
        </>
      )}
    </form>
  );
}
