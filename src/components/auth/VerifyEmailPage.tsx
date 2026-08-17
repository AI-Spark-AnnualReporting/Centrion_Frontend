import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { auth, ApiError } from '@/lib/api';
import { AuthAside } from './PasswordResetPages';

const CODE_TTL_SECONDS = 10 * 60;
const RESEND_COOLDOWN_SECONDS = 45;

const errText = { fontSize: '11px', color: '#E5484D', marginTop: 6 } as const;

function formatMMSS(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Lands here right after signup (email in location.state), or from LoginPage
// when it catches the "verify your email first" 403 — also mirrored into the
// URL so a page refresh doesn't strand the user with no email to act on.
export function VerifyEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  const stateEmail = (location.state as { email?: string } | null)?.email;
  const email = (stateEmail || params.get('email') || '').trim();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(CODE_TTL_SECONDS);
  const [resendCooldown, setResendCooldown] = useState(0);
  const codeExpired = secondsLeft <= 0;

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
      setResendCooldown((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const handleResend = async () => {
    if (resendCooldown > 0 || !email) return;
    setError(null);
    // Always resolves { sent: true } — a thrown error here means the request
    // itself failed (network/5xx), not that the email was invalid.
    try {
      await auth.resendVerification(email);
    } catch {
      /* best-effort */
    }
    setNotice("If that email needs a new code, we've just sent one.");
    setSecondsLeft(CODE_TTL_SECONDS);
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
  };

  const handleSubmit = async () => {
    if (submitting || !email) return;
    if (code.length !== 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      await auth.verifyEmail(email, code);
      navigate('/login', { replace: true, state: { verified: true, email } });
    } catch (err) {
      if (err instanceof ApiError && /too many attempts/i.test(err.message)) {
        setError(`${err.message} Use "Resend code" below to get a new one.`);
      } else if (err instanceof ApiError) {
        setError(err.message || "That code didn't work. Please try again.");
      } else {
        setError('Something went wrong. Please try again.');
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
          blurb="One last step — confirm it's really you before we finish setting up your Centriyon workspace."
          stats={[
            ['6-digit code', 'Sent to your inbox, valid for 10 minutes.'],
            ['No code?', "Use Resend below — it's fine to ask for a new one."],
          ]}
        />
        <div className="auth-r">
          <h2>Verify your email</h2>

          {!email ? (
            <>
              <p>We couldn&apos;t tell which address to verify.</p>
              <div style={{ ...errText, marginTop: 0, marginBottom: 10 }} role="alert">
                Please sign up again, or sign in if you already have a code waiting.
              </div>
              <button className="btn-auth" onClick={() => navigate('/register')}>
                Back to sign up
              </button>
              <div className="auth-sw">
                Already verifying? <a onClick={() => navigate('/login')}>Sign in</a>
              </div>
            </>
          ) : (
            <>
              <p>
                Enter the code we sent to <strong>{email}</strong>.
              </p>

              {notice && (
                <div style={{ fontSize: '11px', color: '#30A46C', marginBottom: '10px' }} role="status">
                  {notice}
                </div>
              )}

              <div className="fl">
                <label>Verification code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete="one-time-code"
                  className="inp"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6));
                    if (error) setError(null);
                  }}
                  onKeyDown={handleKeyDown}
                  autoFocus
                  style={{ letterSpacing: '4px' }}
                />
                {error && <div style={errText} role="alert">{error}</div>}
              </div>

              <div style={{ fontSize: '11px', color: codeExpired ? '#E5484D' : '#8A90A8', marginBottom: '14px' }}>
                {codeExpired
                  ? 'This code has expired — request a new one.'
                  : `Code expires in ${formatMMSS(secondsLeft)}`}
              </div>

              <button className="btn-auth" onClick={() => void handleSubmit()} disabled={submitting}>
                {submitting ? 'Verifying…' : 'Verify email'}
              </button>

              <div className="auth-sw">
                Didn&apos;t get it?{' '}
                <a
                  onClick={() => { if (resendCooldown <= 0) void handleResend(); }}
                  style={resendCooldown > 0 ? { pointerEvents: 'none', opacity: 0.55 } : undefined}
                >
                  {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
