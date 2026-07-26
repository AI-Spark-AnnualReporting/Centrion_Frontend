import { useEffect, useRef, useState, type ReactNode } from 'react';

// Shared full-screen "AI processing" loader — the white card with the rotating
// ring + pulse halos + "AI" label, a milestone checklist, a progress bar and
// rotating tips. Used for every loading screen in the signup → onboarding
// journey so they all look identical. Drive it with `done`: while false it
// climbs toward ~90% and holds; set true to finish to 100% (then `onDone`).

const PRIMARY = '#4040C8';

const DEFAULT_TIPS = [
  'Your agents use GRI, IFRS, and SAMA frameworks to generate questions tailored to your sector.',
  "Each department gets its own AI agent trained on your company's context.",
  'Annual reporting cycles can be activated once your team is set up.',
  'ESG metrics and financial KPIs are tracked automatically across reports.',
  'Invite team members and assign them to departments anytime.',
];

// Rotating ring with expanding pulse halos + an "AI" label.
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
            animation: 'onb-ring 2.1s ease-out infinite',
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

export interface AiLoadingScreenProps {
  title: string;
  subtitle: string;
  milestones: string[];
  done?: boolean;
  doneTitle?: string;
  doneSubtitle?: string;
  onDone?: () => void;
  tips?: string[];
  // Controlled mode (real backend binding). When `controlledProgress` is a
  // number, the internal simulation is disabled and this value (0–99 while
  // running) drives the bar + milestones. `done` then eases it to 100 → onDone.
  controlledProgress?: number;
  // Extra content under the subtitle (e.g. backend stat tiles).
  headerExtra?: ReactNode;
  // Footer content (e.g. a "Run in background" button).
  footer?: ReactNode;
}

export default function AiLoadingScreen({
  title, subtitle, milestones, done = false, doneTitle, doneSubtitle, onDone, tips = DEFAULT_TIPS,
  controlledProgress, headerExtra, footer,
}: AiLoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [currentTip, setCurrentTip] = useState(0);
  const progressRef = useRef(0);
  const doneRef = useRef(false);
  const controlled = controlledProgress != null;

  // Simulated climb (onboarding): toward 90% and hold; once `done`, ease to
  // 100% then fire onDone. Disabled in controlled mode.
  useEffect(() => {
    if (controlled) return;
    const target = 9000 + milestones.length * 1400; // ms
    const start = Date.now();
    let raf = 0;
    const tick = () => {
      let p = progressRef.current;
      if (done) {
        p = Math.min(p + (100 - p) * 0.05 + 0.5, 100);
        if (p >= 99.6) p = 100;
      } else {
        p = Math.min(((Date.now() - start) / target) * 100, 90);
      }
      progressRef.current = p;
      setProgress(p);
      if (done && p >= 100 && !doneRef.current) {
        doneRef.current = true;
        if (onDone) setTimeout(onDone, 900);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [controlled, done, milestones.length, onDone]);

  // Controlled mode (real backend progress): follow `controlledProgress` (capped
  // at 99 while running); once `done`, ease to 100% then fire onDone.
  useEffect(() => {
    if (!controlled) return;
    if (!done) {
      const p = Math.min(99, Math.max(0, controlledProgress ?? 0));
      progressRef.current = p;
      setProgress(p);
      return;
    }
    let raf = 0;
    const tick = () => {
      let p = progressRef.current;
      p = Math.min(p + (100 - p) * 0.08 + 0.5, 100);
      if (p >= 99.6) p = 100;
      progressRef.current = p;
      setProgress(p);
      if (p >= 100 && !doneRef.current) {
        doneRef.current = true;
        if (onDone) setTimeout(onDone, 900);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [controlled, done, controlledProgress, onDone]);

  useEffect(() => {
    const t = setInterval(() => setCurrentTip((c) => (c + 1) % tips.length), 6000);
    return () => clearInterval(t);
  }, [tips.length]);

  const allDone = progress >= 100;
  const stepWidth = 90 / Math.max(1, milestones.length);
  const activeIdx = allDone ? milestones.length : Math.min(milestones.length - 1, Math.floor(progress / stepWidth));

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
          {allDone && doneTitle ? doneTitle : title}
        </h1>
        <p style={{ fontSize: 12, color: '#9BA3C4', margin: '0 0 22px' }}>
          {allDone && doneSubtitle ? doneSubtitle : subtitle}
        </p>

        {headerExtra && <div style={{ marginBottom: 22 }}>{headerExtra}</div>}

        <div style={{ background: '#FAFBFE', border: '1px solid #ECEEF8', borderRadius: 14, padding: '10px 20px', textAlign: 'left' }}>
          {milestones.map((label, i) => (
            <MilestoneRow
              key={label}
              label={label}
              status={allDone || i < activeIdx ? 'complete' : i === activeIdx ? 'active' : 'pending'}
            />
          ))}
        </div>

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
            <strong style={{ color: '#1A1D2E' }}>Did you know?</strong> {tips[currentTip]}
          </span>
        </div>

        {footer && <div style={{ marginTop: 18 }}>{footer}</div>}
      </div>
    </div>
  );
}
