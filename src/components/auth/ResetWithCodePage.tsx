// /reset-with-code — on-premises only. For a client server with no email
// server, where "Forgot password" emails can't arrive and no other admin can
// reset the password: the user asks Spark, Spark makes a one-use code for this
// email on this server (valid 24 h), and the user enters it here.
//
// Plan: Centriton/.claude/plans/company-licensing.md

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '@/lib/api';
import { AuthAside } from './PasswordResetPages';

const errText = { color: '#DC2626', fontSize: 12, marginTop: 6 } as const;

export function ResetWithCodePage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    if (newPassword.length < 8) return setError('New password must be at least 8 characters.');
    if (confirmPassword !== newPassword) return setError('Passwords do not match.');
    setSubmitting(true);
    setError('');
    try {
      await auth.resetPasswordWithCode(email.trim(), code.trim(), newPassword);
      navigate('/login', { replace: true, state: { passwordReset: true } });
    } catch (err) {
      // The backend says exactly what's wrong (expired, used, other email…).
      setError(err instanceof Error ? err.message : 'Could not reset your password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <AuthAside
          blurb="No email on this server? Ask Centriyon for a reset code for your email address, then enter it here."
          stats={[
            ['One use', 'Each code works once, for one email on this server.'],
            ['24 hours', 'Ask Centriyon for a new code if it has expired.'],
          ]}
        />
        <div className="auth-r">
          <h2>Reset with a code from Centriyon</h2>
          <p>Enter your email, the code and a new password.</p>
          <div className="fl">
            <label>Email address</label>
            <input type="email" className="inp" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
          </div>
          <div className="fl">
            <label>Reset code</label>
            <textarea className="inp" rows={3} value={code} onChange={(e) => setCode(e.target.value)} style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }} />
          </div>
          <div className="fl">
            <label>New password</label>
            <input type="password" className="inp" placeholder="At least 8 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="fl">
            <label>Confirm new password</label>
            <input type="password" className="inp" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
          </div>
          {error && <div style={{ ...errText, marginBottom: 8 }} role="alert">{error}</div>}
          <button className="btn-auth" onClick={() => void submit()} disabled={submitting || !email || !code} style={{ marginTop: 6 }}>
            {submitting ? 'Saving…' : 'Set password'}
          </button>
          <div className="auth-sw">
            Remembered it? <a onClick={() => navigate('/login')}>Sign in</a>
          </div>
        </div>
      </div>
    </div>
  );
}
