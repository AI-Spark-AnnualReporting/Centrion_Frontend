import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';

const LogoMark = () => (
  <svg viewBox="0 0 16 16" fill="none" width="17" height="17">
    <rect x="1" y="1" width="6" height="6" rx="1.2" fill="white" />
    <rect x="9" y="1" width="6" height="6" rx="1.2" fill="white" opacity=".4" />
    <rect x="1" y="9" width="6" height="6" rx="1.2" fill="white" opacity=".4" />
    <rect x="9" y="9" width="6" height="6" rx="1.2" fill="white" />
  </svg>
);

// Mandatory rotation screen for users created via /companies/{id}/team. The
// JWT is already in localStorage at this point — ProtectedRoute is what
// pinned us here, so the only escape is a successful POST /auth/change-password
// (or logging out, which deliberately stays available since the user might
// have been added by mistake / want to back out).
export function ChangePasswordPage() {
  const navigate = useNavigate();
  const { user, changePassword, logout } = useAuth();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Keyed errors so we can show feedback under the relevant field rather
  // than just lumping everything into a single banner.
  const [errors, setErrors] = useState<{
    new?: string;
    confirm?: string;
    form?: string;
  }>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const next: typeof errors = {};
    if (newPassword.length < 8)
      next.new = 'New password must be at least 8 characters.';
    if (confirmPassword !== newPassword)
      next.confirm = 'Passwords do not match.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (submitting) return;
    if (!validate()) return;
    setSubmitting(true);
    try {
      await changePassword(newPassword);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      // Surface any failure under the generic banner instead of swallowing it.
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setErrors({ form: 'Could not update your password. Please try again.' });
        } else if (err.status === 422) {
          const detail = (err.body as { detail?: unknown })?.detail;
          const message =
            typeof detail === 'string'
              ? detail
              : Array.isArray(detail) && detail[0]?.msg
                ? String(detail[0].msg)
                : 'New password did not meet the requirements.';
          setErrors({ new: message });
        } else {
          setErrors({ form: err.message || 'Could not update password.' });
        }
      } else if (err instanceof Error) {
        setErrors({ form: err.message });
      } else {
        setErrors({ form: 'Could not update password.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void handleSubmit();
  };

  const firstName = user?.full_name?.split(' ')[0] ?? 'there';

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-l">
          <div>
            <div className="flex items-center gap-[10px] mb-3">
              <div className="w-9 h-9 bg-[#4040C8] rounded-[10px] flex items-center justify-center flex-shrink-0">
                <LogoMark />
              </div>
              <span className="text-[17px] font-extrabold text-white tracking-tight">
                Centriyon
              </span>
            </div>
            <p
              style={{
                fontSize: '11px',
                color: 'rgba(255,255,255,.55)',
                fontWeight: 500,
                marginBottom: 0,
              }}
            >
              Investor Portal
            </p>
            <p
              style={{
                fontSize: '11px',
                color: 'rgba(255,255,255,.4)',
                lineHeight: 1.65,
                marginBottom: '32px',
                maxWidth: '240px',
              }}
            >
              You&apos;re a step away from the dashboard — please choose a
              permanent password before continuing.
            </p>
          </div>
          <div className="flex flex-col gap-[10px]">
            <div className="auth-stat">
              <div className="auth-sv">First-login security</div>
              <div className="auth-sl">
                Temp passwords expire as soon as you set your own.
              </div>
            </div>
            <div className="auth-stat">
              <div className="auth-sv">8 characters minimum</div>
              <div className="auth-sl">
                Mix of letters, numbers and symbols recommended.
              </div>
            </div>
          </div>
        </div>
        <div className="auth-r">
          <h2>Welcome, {firstName}</h2>
          <p>Set your password to continue to the portal.</p>

          <div className="fl">
            <label>New password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                className="inp"
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (errors.new) setErrors((p) => ({ ...p, new: undefined }));
                }}
                onKeyDown={handleKeyDown}
                autoComplete="new-password"
                autoFocus
                style={{ paddingRight: 36 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
                title={showPassword ? 'Hide passwords' : 'Show passwords'}
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
                {showPassword ? (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            {errors.new && (
              <div
                style={{ fontSize: '11px', color: '#E5484D', marginTop: 6 }}
                role="alert"
              >
                {errors.new}
              </div>
            )}
          </div>

          <div className="fl">
            <label>Confirm new password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              className="inp"
              placeholder="Re-type the new password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (errors.confirm)
                  setErrors((p) => ({ ...p, confirm: undefined }));
              }}
              onKeyDown={handleKeyDown}
              autoComplete="new-password"
            />
            {errors.confirm && (
              <div
                style={{ fontSize: '11px', color: '#E5484D', marginTop: 6 }}
                role="alert"
              >
                {errors.confirm}
              </div>
            )}
          </div>

          {errors.form && (
            <div
              style={{ fontSize: '11px', color: '#E5484D', marginBottom: 8 }}
              role="alert"
            >
              {errors.form}
            </div>
          )}

          <button
            className="btn-auth"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            style={{ marginTop: 6 }}
          >
            {submitting ? 'Updating…' : 'Set password & continue'}
          </button>

          <div
            className="auth-sw"
            style={{ display: 'flex', justifyContent: 'center', gap: 4 }}
          >
            Not the right account?{' '}
            <a
              onClick={() => {
                logout();
                navigate('/login', { replace: true });
              }}
            >
              Sign out
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChangePasswordPage;
