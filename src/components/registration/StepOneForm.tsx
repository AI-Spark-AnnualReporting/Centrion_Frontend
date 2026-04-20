import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { StepOneState } from '@/types/register';

interface StepOneFormProps {
  initialValues: StepOneState;
  onSubmit: (data: StepOneState) => void;
  error: string;
}

function EyeButton({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? 'Hide password' : 'Show password'}
      title={visible ? 'Hide password' : 'Show password'}
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
      {visible ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}

export function StepOneForm({ initialValues, onSubmit, error }: StepOneFormProps) {
  const [full_name, setFullName] = useState(initialValues.full_name);
  const [email, setEmail] = useState(initialValues.email);
  const [password, setPassword] = useState(initialValues.password);
  const [confirmPassword, setConfirmPassword] = useState(initialValues.confirmPassword);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleContinue = () => {
    onSubmit({ full_name, email, password, confirmPassword });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleContinue();
  };

  return (
    <>
      <div className="fl">
        <label>Full name</label>
        <input
          type="text"
          className="inp"
          placeholder="e.g. Ahsan Bilal"
          value={full_name}
          onChange={(e) => setFullName(e.target.value)}
        />
      </div>
      <div className="fl">
        <label>Email address</label>
        <input
          type="email"
          className="inp"
          placeholder="you@centriton.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="fl">
        <label>Password</label>
        <div style={{ position: 'relative' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            className="inp"
            placeholder="Min. 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ paddingRight: 36 }}
          />
          <EyeButton visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />
        </div>
      </div>
      <div className="fl">
        <label>Confirm password</label>
        <div style={{ position: 'relative' }}>
          <input
            type={showConfirm ? 'text' : 'password'}
            className="inp"
            placeholder="Repeat your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ paddingRight: 36 }}
          />
          <EyeButton visible={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />
        </div>
      </div>

      <button className="btn-auth" onClick={handleContinue} type="button">
        Continue →
      </button>

      {error && (
        <div style={{ fontSize: '11px', color: '#E5484D', marginTop: '8px' }} role="alert">
          {error}
        </div>
      )}

      <div className="auth-sw">
        Already have an account? <Link to="/login">Sign in</Link>
      </div>
    </>
  );
}

export default StepOneForm;
