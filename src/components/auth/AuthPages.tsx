import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { createCompany, getSectors, register } from '@/lib/api';
import type { StepOneState, StepTwoState } from '@/types/register';
import type { Sector } from '@/types/company';
import { StepIndicator } from '@/components/registration/StepIndicator';
import { StepOneForm } from '@/components/registration/StepOneForm';
import { StepTwoForm } from '@/components/registration/StepTwoForm';

const LogoMark = () => (
  <svg viewBox="0 0 16 16" fill="none" width="17" height="17">
    <rect x="1" y="1" width="6" height="6" rx="1.2" fill="white" />
    <rect x="9" y="1" width="6" height="6" rx="1.2" fill="white" opacity=".4" />
    <rect x="1" y="9" width="6" height="6" rx="1.2" fill="white" opacity=".4" />
    <rect x="9" y="9" width="6" height="6" rx="1.2" fill="white" />
  </svg>
);

const MicrosoftLogo = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
    <rect x=".5" y=".5" width="5.5" height="5.5" fill="#F25022" />
    <rect x="7" y=".5" width="5.5" height="5.5" fill="#7FBA00" />
    <rect x=".5" y="7" width="5.5" height="5.5" fill="#00A4EF" />
    <rect x="7" y="7" width="5.5" height="5.5" fill="#FFB900" />
  </svg>
);

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showRegisteredBanner, setShowRegisteredBanner] = useState<boolean>(
    (location.state as { registered?: boolean } | null)?.registered === true,
  );

  const handleLogin = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch {
      setError('Invalid email or password');
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void handleLogin();
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-l">
          <div>
            <div className="flex items-center gap-[10px] mb-3">
              <div className="w-9 h-9 bg-[#4040C8] rounded-[10px] flex items-center justify-center flex-shrink-0">
                <LogoMark />
              </div>
              <span className="text-[17px] font-extrabold text-white tracking-tight">Centriyon</span>
            </div>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,.55)', fontWeight: 500, marginBottom: 0 }}>Investor Portal</p>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,.4)', lineHeight: 1.65, marginBottom: '32px', maxWidth: '240px' }}>
              The institutional-grade ESG &amp; IR platform for SAMA/CMA-regulated companies in Saudi Arabia.
            </p>
          </div>
          <div className="flex flex-col gap-[10px]">
            <div className="auth-stat"><div className="auth-sv">36+ GRI Metrics</div><div className="auth-sl">Fully mapped to GRI Universal 2021</div></div>
            <div className="auth-stat"><div className="auth-sv">SAMA · CMA · Tadawul</div><div className="auth-sl">Saudi regulatory alignment built-in</div></div>
            <div className="auth-stat"><div className="auth-sv">91.7% Confidence</div><div className="auth-sl">AI-powered ESG disclosure scoring</div></div>
          </div>
        </div>
        <div className="auth-r">
          <h2>Welcome back</h2>
          <p>Sign in to your Centriyon account</p>
          {showRegisteredBanner && (
            <div style={{ fontSize: '11px', color: '#30A46C', marginBottom: '10px' }} role="status">
              Account created successfully. Please sign in.
            </div>
          )}
          <div className="fl">
            <label>Email address</label>
            <input
              type="email"
              className="inp"
              placeholder="ahmad@al-noor.sa"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (showRegisteredBanner) setShowRegisteredBanner(false);
              }}
            />
          </div>
          <div className="fl">
            <label>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                className="inp"
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (showRegisteredBanner) setShowRegisteredBanner(false);
                }}
                onKeyDown={handleKeyDown}
                style={{ paddingRight: 36 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
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
            </div>
          </div>
          <div className="flex justify-between text-[11px] mb-[14px]">
            <label className="flex items-center gap-[6px] text-[#5A6080] cursor-pointer">
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} style={{ accentColor: '#4040C8' }} /> Remember me
            </label>
            <a className="text-[#4040C8] cursor-pointer">Forgot password?</a>
          </div>
          <button className="btn-auth" onClick={handleLogin} disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in to Portal'}
          </button>
          {error && (
            <div style={{ fontSize: '11px', color: '#E5484D', marginTop: '8px' }} role="alert">
              {error}
            </div>
          )}
          {/* <div className="auth-div">or</div>
          <button className="btn-sso"><MicrosoftLogo /> Continue with Microsoft SSO</button> */}
          <div className="auth-sw">No account? <a onClick={() => navigate('/register')}>Create one</a></div>
        </div>
      </div>
    </div>
  );
}

export function SignupPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2>(1);
  const [stepOne, setStepOne] = useState<StepOneState>({
    full_name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [stepTwo, setStepTwo] = useState<StepTwoState>({
    companyName: '',
    sector_id: '',
    jurisdiction: 'KSA',
  });
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [sectorsLoading, setSectorsLoading] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    getSectors()
      .then((data) => setSectors(data))
      .catch(() => setSectors([]))
      .finally(() => setSectorsLoading(false));
  }, []);

  const handleStepOneSubmit = (data: StepOneState) => {
    setError('');

    if (
      !data.full_name.trim() ||
      !data.email.trim() ||
      !data.password ||
      !data.confirmPassword
    ) {
      setError('All fields are required');
      return;
    }
    if (!data.email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    if (data.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (data.password !== data.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setStepOne(data);
    setStep(2);
  };

  const handleStepTwoSubmit = async (data: StepTwoState) => {
    if (loading || success) return;
    setError('');

    if (!data.companyName.trim()) {
      setError('Company name is required');
      return;
    }
    if (!data.sector_id) {
      setError('Please select a sector');
      return;
    }

    setStepTwo(data);
    setLoading(true);
    try {
      const companyRes = await createCompany({
        name: data.companyName,
        sector_id: data.sector_id,
        jurisdiction: data.jurisdiction || undefined,
      });
      const companyId = companyRes.company.id;

      await register({
        email: stepOne.email,
        password: stepOne.password,
        full_name: stepOne.full_name,
        company_id: companyId,
      });

      setSuccess(true);
      setTimeout(() => {
        navigate('/login', { state: { registered: true } });
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setError('');
    setStep(1);
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-l">
          <div>
            <div className="flex items-center gap-[10px] mb-3">
              <div className="w-9 h-9 bg-[#4040C8] rounded-[10px] flex items-center justify-center flex-shrink-0">
                <LogoMark />
              </div>
              <span className="text-[17px] font-extrabold text-white tracking-tight">Centriyon</span>
            </div>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,.4)', lineHeight: 1.65, marginBottom: '32px', maxWidth: '240px' }}>
              Get started in minutes — GRI 2021, IFRS S1/S2, SAMA &amp; CMA pre-configured.
            </p>
          </div>
          <div className="flex flex-col gap-[10px]">
            <div className="auth-stat"><div className="auth-sv">Free 14-day trial</div><div className="auth-sl">No credit card required</div></div>
            <div className="auth-stat"><div className="auth-sv">80+ frameworks</div><div className="auth-sl">Global regulatory coverage</div></div>
          </div>
        </div>
        <div className="auth-r">
          <StepIndicator currentStep={step} />
          <h2>{step === 1 ? 'Your Details' : 'Company Setup'}</h2>
          <p>
            {step === 1
              ? 'Step 1 of 2 — Personal information'
              : 'Step 2 of 2 — Your organisation'}
          </p>

          {success && (
            <div style={{ fontSize: '11px', color: '#30A46C', marginBottom: '8px' }} role="status">
              Account created! Setting up your workspace…
            </div>
          )}

          {step === 1 ? (
            <StepOneForm
              initialValues={stepOne}
              onSubmit={handleStepOneSubmit}
              error={error}
            />
          ) : (
            <StepTwoForm
              initialValues={stepTwo}
              sectors={sectors}
              sectorsLoading={sectorsLoading}
              onSubmit={handleStepTwoSubmit}
              onBack={handleBack}
              error={error}
              loading={loading}
            />
          )}
        </div>
      </div>
    </div>
  );
}
