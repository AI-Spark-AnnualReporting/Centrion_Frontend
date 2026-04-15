import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  const handleLogin = () => {
    navigate('/dashboard');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin();
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
          <div className="fl">
            <label>Email address</label>
            <input type="email" className="inp" placeholder="ahmad@al-noor.sa" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="fl">
            <label>Password</label>
            <input type="password" className="inp" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={handleKeyDown} />
          </div>
          <div className="flex justify-between text-[11px] mb-[14px]">
            <label className="flex items-center gap-[6px] text-[#5A6080] cursor-pointer">
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} style={{ accentColor: '#4040C8' }} /> Remember me
            </label>
            <a className="text-[#4040C8] cursor-pointer">Forgot password?</a>
          </div>
          <button className="btn-auth" onClick={handleLogin}>Sign in to Portal</button>
          <div className="auth-div">or</div>
          <button className="btn-sso"><MicrosoftLogo /> Continue with Microsoft SSO</button>
          <div className="auth-sw">No account? <a onClick={() => navigate('/signup')}>Create one</a></div>
        </div>
      </div>
    </div>
  );
}

export function SignupPage() {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSignup = () => {
    navigate('/dashboard');
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
          <h2>Create account</h2>
          <p>Start your 14-day free trial</p>
          <div className="fl">
            <div className="fl-row">
              <div><label>First name</label><input type="text" className="inp" placeholder="Ahmad" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
              <div><label>Last name</label><input type="text" className="inp" placeholder="Al-Rashid" value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
            </div>
          </div>
          <div className="fl"><label>Company</label><input type="text" className="inp" placeholder="Al-Noor Capital" value={company} onChange={(e) => setCompany(e.target.value)} /></div>
          <div className="fl"><label>Work email</label><input type="email" className="inp" placeholder="ahmad@al-noor.sa" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="fl"><label>Password</label><input type="password" className="inp" placeholder="Create a strong password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <button className="btn-auth" onClick={handleSignup}>Create Account</button>
          <div className="auth-sw">Already have an account? <a onClick={() => navigate('/')}>Sign in</a></div>
        </div>
      </div>
    </div>
  );
}
