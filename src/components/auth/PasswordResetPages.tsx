import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth } from '@/lib/api';
import { ApiError } from '@/lib/api';

const LogoMark = () => (
  <svg viewBox="0 0 16 16" fill="none" width="17" height="17">
    <rect x="1" y="1" width="6" height="6" rx="1.2" fill="white" />
    <rect x="9" y="1" width="6" height="6" rx="1.2" fill="white" opacity=".4" />
    <rect x="1" y="9" width="6" height="6" rx="1.2" fill="white" opacity=".4" />
    <rect x="9" y="9" width="6" height="6" rx="1.2" fill="white" />
  </svg>
);

// The dark left panel every auth screen shares. Same markup as LoginPage /
// ChangePasswordPage, just parameterised — these two screens are the third and
// fourth to need it, so it stops being copy-paste here. Exported so later
// single-purpose auth screens (e.g. VerifyEmailPage) can reuse it too.
export function AuthAside({ blurb, stats }: { blurb: string; stats: [string, string][] }) {
  return (
    <div className="auth-l">
      <div>
        <div className="flex items-center gap-[10px] mb-3">
          <div className="w-9 h-9 bg-[#4040C8] rounded-[10px] flex items-center justify-center flex-shrink-0">
            <LogoMark />
          </div>
          <span className="text-[17px] font-extrabold text-white tracking-tight">Centriyon</span>
        </div>
        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,.4)', lineHeight: 1.65, marginTop: '10px', marginBottom: '32px', maxWidth: '250px' }}>
          {blurb}
        </p>
      </div>
      <div className="flex flex-col gap-[10px]">
        {stats.map(([title, sub]) => (
          <div className="auth-stat" key={title}>
            <div className="auth-sv">{title}</div>
            <div className="auth-sl">{sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const errText = { fontSize: '11px', color: '#E5484D', marginTop: 6 } as const;

// Eye toggle inside the field, same as LoginPage / ChangePasswordPage. One
// button drives both password fields — hiding the confirmation while the new
// password is visible helps nobody.
function EyeToggle({ shown, onClick }: { shown: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={shown ? 'Hide passwords' : 'Show passwords'}
      title={shown ? 'Hide passwords' : 'Show passwords'}
      style={{
        position: 'absolute',
        top: '50%',
        right: 10,
        transform: 'translateY(-50%)',
        width: 22,
        height: 22,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 0,
        padding: 0,
        cursor: 'pointer',
        color: '#8A90A8',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {shown ? (
          <>
            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </>
        ) : (
          <>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
            <circle cx="12" cy="12" r="3" />
          </>
        )}
      </svg>
    </button>
  );
}

// Step 1 — ask for the email. The success screen is shown for ANY well-formed
// address, whether or not an account exists: saying "no such user" here would
// turn the form into an account-enumeration oracle.
export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // The backend returns the reset link inline while it runs DEBUG=true (and
  // mail delivery is off in dev), so surface it here rather than making
  // everyone dig it out of the server log. Never rendered in a prod build.
  const [devLink, setDevLink] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (submitting) return;
    if (!email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await auth.forgotPassword(email.trim());
      if (import.meta.env.DEV && res.reset_link) setDevLink(res.reset_link);
      setSent(true);
    } catch (err) {
      // A 404 would mean "unknown email" — the backend answers 200 for those
      // on purpose, but show the neutral screen anyway so a future change on
      // that side can't leak through the UI.
      if (err instanceof ApiError && err.status === 404) setSent(true);
      else setError('Could not send the reset link. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <AuthAside
          blurb="Forgot your password? Enter the email you sign in with and we'll send you a link to set a new one."
          stats={[
            ['Link expires quickly', 'Reset links are single-use and short-lived.'],
            ['Still stuck?', 'Your workspace admin can re-issue access.'],
          ]}
        />
        <div className="auth-r">
          {sent ? (
            <>
              <h2>Check your inbox</h2>
              <p>
                If an account exists for <strong>{email.trim()}</strong>, we&apos;ve sent a link to
                reset your password. It expires shortly — check spam if it hasn&apos;t arrived.
              </p>
              {devLink && (
                <div style={{ fontSize: '11px', color: '#5A6080', marginBottom: 10, wordBreak: 'break-all' }}>
                  <strong>Dev only:</strong>{' '}
                  {/* PUBLIC_BASE_URL unset on the backend means reset_link is
                      the bare token, so build the local URL in that case. */}
                  <a
                    className="text-[#4040C8] cursor-pointer"
                    href={devLink.startsWith('http') ? devLink : `/reset-password?token=${encodeURIComponent(devLink)}`}
                  >
                    open the reset link
                  </a>
                </div>
              )}
              <button className="btn-auth" onClick={() => navigate('/login')} style={{ marginTop: 6 }}>
                Back to sign in
              </button>
              <div className="auth-sw">
                Wrong address? <a onClick={() => { setSent(false); setError(null); setDevLink(null); }}>Try another</a>
              </div>
            </>
          ) : (
            <>
              <h2>Reset your password</h2>
              <p>We&apos;ll email you a link to choose a new one.</p>
              <div className="fl">
                <label>Email address</label>
                <input
                  type="email"
                  className="inp"
                  placeholder="ahmad@al-noor.sa"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleSubmit(); }}
                  autoComplete="email"
                  autoFocus
                />
                {error && <div style={errText} role="alert">{error}</div>}
              </div>
              <button className="btn-auth" onClick={() => void handleSubmit()} disabled={submitting}>
                {submitting ? 'Sending…' : 'Send reset link'}
              </button>
              <div className="auth-sw">
                Remembered it? <a onClick={() => navigate('/login')}>Sign in</a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Step 2 — the target of the emailed link, /reset-password?token=…. No session
// exists at this point; the token in the URL is the only proof of identity, and
// the backend is what decides whether it's still valid.
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ new?: string; confirm?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (submitting) return;
    const next: typeof errors = {};
    if (newPassword.length < 8) next.new = 'New password must be at least 8 characters.';
    if (confirmPassword !== newPassword) next.confirm = 'Passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      await auth.resetPassword(token, newPassword);
      navigate('/login', { replace: true, state: { passwordReset: true } });
    } catch (err) {
      // 400 is the backend's single answer for expired / malformed / reused /
      // wrong-purpose tokens — it deliberately doesn't say which, so neither
      // do we. All four have the same fix: get a fresh link.
      if (err instanceof ApiError && err.status === 400) {
        setErrors({ form: 'This reset link has expired or already been used. Request a new one.' });
      } else if (err instanceof ApiError && err.status === 422) {
        // ApiError.message is already the backend's `detail`.
        setErrors({ new: err.message || 'New password did not meet the requirements.' });
      } else {
        setErrors({ form: 'Could not reset your password. Please try again.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void handleSubmit();
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <AuthAside
          blurb="Choose a new password for your Centriyon account. You'll be signed in with it right away."
          stats={[
            ['8 characters minimum', 'Mix of letters, numbers and symbols recommended.'],
            ['Single-use link', 'This link stops working once the password is set.'],
          ]}
        />
        <div className="auth-r">
          <h2>Set a new password</h2>
          <p>Then sign in with it to continue.</p>

          {!token ? (
            <>
              <div style={{ ...errText, marginTop: 0, marginBottom: 10 }} role="alert">
                This link is missing its reset token. Request a fresh one.
              </div>
              <button className="btn-auth" onClick={() => navigate('/forgot-password')}>
                Request a new link
              </button>
            </>
          ) : (
            <>
              <div className="fl">
                <label>New password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="inp"
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); if (errors.new) setErrors((p) => ({ ...p, new: undefined })); }}
                    onKeyDown={handleKeyDown}
                    autoComplete="new-password"
                    autoFocus
                    style={{ paddingRight: 36 }}
                  />
                  <EyeToggle shown={showPassword} onClick={() => setShowPassword((v) => !v)} />
                </div>
                {errors.new && <div style={errText} role="alert">{errors.new}</div>}
              </div>

              <div className="fl">
                <label>Confirm new password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="inp"
                    placeholder="Re-type the new password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); if (errors.confirm) setErrors((p) => ({ ...p, confirm: undefined })); }}
                    onKeyDown={handleKeyDown}
                    autoComplete="new-password"
                    style={{ paddingRight: 36 }}
                  />
                  <EyeToggle shown={showPassword} onClick={() => setShowPassword((v) => !v)} />
                </div>
                {errors.confirm && <div style={errText} role="alert">{errors.confirm}</div>}
              </div>

              {errors.form && (
                <div style={{ ...errText, marginBottom: 8 }} role="alert">{errors.form}</div>
              )}

              <button className="btn-auth" onClick={() => void handleSubmit()} disabled={submitting} style={{ marginTop: 6 }}>
                {submitting ? 'Saving…' : 'Set password'}
              </button>
              <div className="auth-sw">
                <a onClick={() => navigate('/forgot-password')}>Request a new link</a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
