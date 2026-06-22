import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import type { OnboardingPayload } from '@/types/auth';

const PRIMARY = '#4040C8';

const TIPS = [
  'Your agents use GRI, IFRS, and SAMA frameworks to generate questions tailored to your sector.',
  "Each department gets its own AI agent trained on your company's context.",
  'Annual reporting cycles can be activated once your team is set up.',
  'ESG metrics and financial KPIs are tracked automatically across reports.',
  'Invite team members and assign them to departments anytime.',
];

interface Milestone {
  id: string;
  label: string;
  start: number; // % at which this milestone becomes active
}
const MILESTONES: Milestone[] = [
  { id: 'workspace', label: 'Setting up your company workspace', start: 0 },
  { id: 'frameworks', label: 'Configuring your reporting frameworks', start: 18 },
  { id: 'agents', label: 'Creating AI agents for your departments', start: 38 },
  { id: 'finalize', label: 'Finalizing your dashboard', start: 90 },
];

// Rotating ring with expanding pulse halos.
function AnimatedLoader() {
  return (
    <div style={{ position: 'relative', width: 92, height: 92, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {[0, 0.6, 1.2].map((d) => (
        <span
          key={d}
          style={{
            position: 'absolute',
            inset: 6,
            borderRadius: '50%',
            border: `2px solid ${PRIMARY}`,
            animation: `onb-ring 2.1s ease-out infinite`,
            animationDelay: `${d}s`,
          }}
        />
      ))}
      <svg width="92" height="92" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="34" fill="#fff" stroke="#ECEEF8" strokeWidth="4" />
        <circle cx="40" cy="40" r="34" fill="none" stroke={PRIMARY} strokeWidth="4" strokeLinecap="round" strokeDasharray="58 220" transform="rotate(-90 40 40)">
          <animateTransform attributeName="transform" type="rotate" from="-90 40 40" to="270 40 40" dur="1.3s" repeatCount="indefinite" />
        </circle>
        <text x="40" y="47" textAnchor="middle" fontSize="20" fontWeight="800" fill={PRIMARY}>AI</text>
      </svg>
    </div>
  );
}

function MilestoneRow({ label, status }: { label: string; status: 'complete' | 'active' | 'pending' }) {
  const color = status === 'complete' ? '#10B981' : status === 'active' ? '#1A1D2E' : '#9BA3C4';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', fontSize: 13.5, color, fontWeight: status === 'active' ? 700 : 500, transition: 'color .3s' }}>
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 800,
          color: status === 'complete' ? '#fff' : status === 'active' ? '#fff' : '#C4C9DD',
          background: status === 'complete' ? '#10B981' : status === 'active' ? PRIMARY : '#EEF0F6',
          animation: status === 'active' ? 'dpulse 1.4s ease-in-out infinite' : undefined,
        }}
      >
        {status === 'complete' ? '✓' : status === 'active' ? '' : '•'}
      </span>
      <span>{label}</span>
    </div>
  );
}

export default function SetupInProgressAnimation({
  payload,
  departments,
}: {
  payload: OnboardingPayload;
  departments: { code: string; name: string }[];
}) {
  const navigate = useNavigate();
  const { completeOnboarding } = useAuth();

  const [progress, setProgress] = useState(0);
  const [currentTip, setCurrentTip] = useState(0);
  const [apiComplete, setApiComplete] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const firedRef = useRef(false);
  const progressRef = useRef(0);
  const doneRef = useRef(false);

  // Fire the real onboarding API once.
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    completeOnboarding(payload)
      .then(() => setApiComplete(true))
      .catch((e) => setApiError(e instanceof Error ? e.message : 'Setup failed.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drive the progress bar: climb toward 90% over a target window, hold there
  // until the API resolves, then ease smoothly to 100% and navigate.
  useEffect(() => {
    if (apiError) return;
    const target = 9000 + departments.length * 1400; // ms
    const start = Date.now();
    let raf = 0;
    const tick = () => {
      let p = progressRef.current;
      if (apiComplete) {
        p = Math.min(p + (100 - p) * 0.05 + 0.5, 100);
        if (p >= 99.6) p = 100;
      } else {
        const raw = ((Date.now() - start) / target) * 100;
        p = Math.min(raw, 90);
      }
      progressRef.current = p;
      setProgress(p);
      if (apiComplete && p >= 100 && !doneRef.current) {
        doneRef.current = true;
        setTimeout(() => navigate('/dashboard', { replace: true }), 900);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [apiComplete, apiError, departments.length, navigate]);

  // Rotate tips.
  useEffect(() => {
    const t = setInterval(() => setCurrentTip((c) => (c + 1) % TIPS.length), 6000);
    return () => clearInterval(t);
  }, []);

  // Which milestone is active, and (during "agents") which department.
  const activeIdx = MILESTONES.reduce((acc, m, i) => (progress >= m.start ? i : acc), 0);
  const allDone = progress >= 100;
  const trainingName = (() => {
    if (activeIdx !== 2 || departments.length === 0) return null;
    const frac = Math.max(0, Math.min(1, (progress - 38) / (90 - 38)));
    return departments[Math.min(departments.length - 1, Math.floor(frac * departments.length))]?.name ?? null;
  })();

  if (apiError) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F5FB', padding: 20 }}>
        <div className="card" style={{ maxWidth: 440, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#1A1D2E', marginBottom: 8 }}>Setup encountered an issue</div>
          <div style={{ fontSize: 12, color: '#5A6080', marginBottom: 18 }}>{apiError}</div>
          <button type="button" className="btn bp" onClick={() => window.location.reload()}>Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(120% 80% at 50% -10%, #EEEFFE 0%, #F4F5FB 45%, #F4F5FB 100%)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div style={{ position: 'absolute', top: -120, right: -80, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle,rgba(64,64,200,.18),transparent 70%)', animation: 'onb-float 11s ease-in-out infinite', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -140, left: -90, width: 360, height: 360, borderRadius: '50%', background: 'radial-gradient(circle,rgba(91,201,226,.14),transparent 70%)', animation: 'onb-float2 13s ease-in-out infinite', pointerEvents: 'none' }} />

      <div
        className="card"
        style={{ position: 'relative', width: 'min(520px, 100%)', padding: '36px 34px', textAlign: 'center', animation: 'onb-rise .5s ease', boxShadow: '0 30px 70px rgba(20,22,40,.14)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <AnimatedLoader />
        </div>

        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: '-.4px',
            margin: '18px 0 4px',
            background: 'linear-gradient(90deg,#1A1D2E,#4040C8,#1A1D2E)',
            backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            animation: 'onb-sheen 5s linear infinite',
          }}
        >
          {allDone ? 'Your workspace is ready' : 'Processing Your Reports'}
        </h1>
        <p style={{ fontSize: 12, color: '#9BA3C4', margin: '0 0 22px' }}>
          {allDone ? 'Taking you to your dashboard…' : 'Building your intelligence dashboard from your documents.'}
        </p>

        <div style={{ background: '#FAFBFE', border: '1px solid #ECEEF8', borderRadius: 14, padding: '10px 20px', textAlign: 'left' }}>
          {MILESTONES.map((m, i) => (
            <MilestoneRow
              key={m.id}
              label={i === 2 && trainingName ? `Training ${trainingName} agent…` : m.label}
              status={allDone || i < activeIdx ? 'complete' : i === activeIdx ? 'active' : 'pending'}
            />
          ))}
        </div>

        {/* Progress */}
        <div style={{ position: 'relative', height: 9, background: '#E8EAF5', borderRadius: 9, overflow: 'hidden', margin: '22px 0 8px' }}>
          <div
            style={{
              height: '100%',
              width: `${Math.round(progress)}%`,
              borderRadius: 9,
              background: 'linear-gradient(90deg,#4040C8,#5BC9E2,#4040C8)',
              backgroundSize: '200% auto',
              animation: 'onb-sheen 1.6s linear infinite',
              transition: 'width .25s ease',
            }}
          />
        </div>
        <div style={{ fontSize: 12, color: '#5A6080', fontFamily: "'DM Mono', monospace", fontWeight: 700, marginBottom: 24 }}>
          {Math.round(progress)}% complete
        </div>

        {/* Tip */}
        <div
          key={currentTip}
          style={{
            display: 'flex',
            gap: 11,
            textAlign: 'left',
            padding: '13px 16px',
            background: 'linear-gradient(180deg,#FAFAFE,#F4F5FF)',
            border: '1px solid #E5E7FF',
            borderRadius: 12,
            fontSize: 12,
            color: '#5A6080',
            lineHeight: 1.55,
            animation: 'onb-rise .5s ease',
          }}
        >
          <span aria-hidden style={{ flexShrink: 0, fontSize: 14 }}>💡</span>
          <span>
            <strong style={{ color: '#1A1D2E' }}>Did you know?</strong> {TIPS[currentTip]}
          </span>
        </div>
      </div>
    </div>
  );
}
