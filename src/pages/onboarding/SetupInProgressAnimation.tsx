import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import type { OnboardingPayload } from '@/types/auth';
import { companies } from '@/lib/api';
import type { UploadedReportFile } from '@/pages/onboarding/UploadReportsStep';

const PRIMARY = '#4040C8';
const MAX_WAIT_MS = 6 * 60 * 1000; // fallback: open the app anyway if the job runs long

// Playful status words that rotate under the real backend stage (Claude-Code style).
const GERUNDS = [
  'Booping', 'Splunking', 'Skedaddling', 'Noodling', 'Rummaging', 'Wrangling',
  'Percolating', 'Marinating', 'Tinkering', 'Untangling', 'Conjuring', 'Finagling',
  'Whittling', 'Simmering', 'Puttering', 'Schlepping', 'Bamboozling', 'Kerfuffling',
];

const TIPS = [
  'Your agents use GRI, IFRS, and SAMA frameworks to generate questions tailored to your sector.',
  "Each department gets its own AI agent trained on your company's context.",
  'We read every page of your reports so the AI chatbot can answer questions about them.',
  'ESG metrics and financial KPIs are tracked automatically across reports.',
  'Invite team members and assign them to departments anytime.',
];

// Rotating ring with expanding pulse halos + an "AI" label.
function RingLogo() {
  return (
    <div style={{ position: 'relative', width: 92, height: 92, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {[0, 0.6, 1.2].map((d) => (
        <span key={d} style={{ position: 'absolute', inset: 6, borderRadius: '50%', border: `2px solid ${PRIMARY}`, animation: 'onb-ring 2.1s ease-out infinite', animationDelay: `${d}s` }} />
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

// Final onboarding step. Completes onboarding, kicks off the heavy deep-ingest, and shows
// a live progress screen (real backend stages + playful words + real percent) until the
// job finishes — then opens a fully-populated dashboard. A timeout fallback opens the app
// anyway so the user is never trapped.
export default function SetupInProgressAnimation({
  payload,
  files = [],
}: {
  payload: OnboardingPayload;
  files?: UploadedReportFile[];
}) {
  const navigate = useNavigate();
  const { completeOnboarding, user } = useAuth();
  const companyId = user?.company_id ?? null;

  const [detail, setDetail] = useState('Getting your workspace ready…');
  const [percent, setPercent] = useState(0);
  const [gerund, setGerund] = useState(0);
  const [tip, setTip] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firedRef = useRef(false);
  const doneRef = useRef(false);

  const enterDashboard = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    navigate('/dashboard', { replace: true, state: { justUploaded: files.length > 0 } });
  }, [navigate, files.length]);

  // Complete onboarding, then kick off the deep-ingest for the validated docs.
  const fire = useCallback(() => {
    setError(null);
    completeOnboarding(payload)
      .then(async () => {
        const items = files
          .filter((f) => f.documentId)
          .map((f) => ({ document_id: f.documentId as string, doc_type: f.docType, period: f.period }));
        if (!companyId || !items.length) {
          enterDashboard(); // nothing to process → straight into the app
          return;
        }
        try {
          await companies.ingestOnboarding(companyId, items);
        } catch {
          enterDashboard(); // couldn't start the ingest → don't trap the user
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Setup failed.'));
  }, [completeOnboarding, payload, companyId, files, enterDashboard]);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    fire();
  }, [fire]);

  // Poll the real backend progress off companies.onboarding_progress / status.
  useEffect(() => {
    if (!companyId || error) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const startedAt = Date.now();
    const poll = async () => {
      try {
        const c = await companies.getMyCompany();
        if (cancelled) return;
        const prog = c.onboarding_progress;
        if (prog?.detail) setDetail(prog.detail);
        if (typeof prog?.percent === 'number') setPercent((p) => Math.max(p, prog.percent as number));
        if (c.report_extraction_status === 'done' || c.report_extraction_status === 'failed') {
          setPercent(100);
          setFinishing(true);
          setTimeout(enterDashboard, 1000);
          return;
        }
      } catch {
        /* transient — keep polling */
      }
      if (Date.now() - startedAt >= MAX_WAIT_MS) {
        enterDashboard();
        return;
      }
      timer = setTimeout(poll, 2000);
    };
    timer = setTimeout(poll, 1500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [companyId, error, enterDashboard]);

  // Rotate the playful gerund + the tips.
  useEffect(() => {
    const g = setInterval(() => setGerund((n) => (n + 1) % GERUNDS.length), 1600);
    const t = setInterval(() => setTip((n) => (n + 1) % TIPS.length), 6000);
    return () => { clearInterval(g); clearInterval(t); };
  }, []);

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F5FB', padding: 20 }}>
        <div className="card" style={{ maxWidth: 440, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#1A1D2E', marginBottom: 8 }}>Setup encountered an issue</div>
          <div style={{ fontSize: 12, color: '#5A6080', marginBottom: 18 }}>{error}</div>
          <button type="button" className="btn bp" onClick={fire}>Try again</button>
        </div>
      </div>
    );
  }

  const pct = Math.round(percent);

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(120% 80% at 50% -10%, #EEEFFE 0%, #F4F5FB 45%, #F4F5FB 100%)', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ position: 'absolute', top: -120, right: -80, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle,rgba(64,64,200,.18),transparent 70%)', animation: 'onb-float 11s ease-in-out infinite', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -140, left: -90, width: 360, height: 360, borderRadius: '50%', background: 'radial-gradient(circle,rgba(91,201,226,.14),transparent 70%)', animation: 'onb-float2 13s ease-in-out infinite', pointerEvents: 'none' }} />

      <div className="card" style={{ position: 'relative', width: 'min(540px, 100%)', padding: '36px 34px', textAlign: 'center', animation: 'onb-rise .5s ease', boxShadow: '0 30px 70px rgba(20,22,40,.14)' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <RingLogo />
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.4px', margin: '18px 0 4px', background: 'linear-gradient(90deg,#1A1D2E,#4040C8,#1A1D2E)', backgroundSize: '200% auto', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'onb-sheen 5s linear infinite' }}>
          {finishing ? 'Your workspace is ready' : 'Building your intelligence dashboard'}
        </h1>
        <p style={{ fontSize: 12, color: '#9BA3C4', margin: '0 0 24px' }}>
          {finishing ? 'Taking you to your dashboard…' : 'We only do this once — sit tight while we read your reports.'}
        </p>

        {/* Real current backend stage */}
        <div style={{ fontSize: 14.5, fontWeight: 700, color: '#1A1D2E', minHeight: 20, transition: 'color .3s' }}>
          {detail}
        </div>
        {/* Playful rotating word */}
        {!finishing && (
          <div key={gerund} style={{ fontSize: 12.5, color: PRIMARY, fontFamily: "'DM Mono', monospace", fontWeight: 700, marginTop: 6, animation: 'onb-rise .45s ease' }}>
            {GERUNDS[gerund]}<span style={{ opacity: 0.6 }}>…</span>
          </div>
        )}

        <div style={{ position: 'relative', height: 9, background: '#E8EAF5', borderRadius: 9, overflow: 'hidden', margin: '22px 0 8px' }}>
          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 9, background: 'linear-gradient(90deg,#4040C8,#5BC9E2,#4040C8)', backgroundSize: '200% auto', animation: 'onb-sheen 1.6s linear infinite', transition: 'width .4s ease' }} />
        </div>
        <div style={{ fontSize: 12, color: '#5A6080', fontFamily: "'DM Mono', monospace", fontWeight: 700, marginBottom: 24 }}>
          {pct}% complete
        </div>

        <div key={tip} style={{ display: 'flex', gap: 11, textAlign: 'left', padding: '13px 16px', background: 'linear-gradient(180deg,#FAFAFE,#F4F5FF)', border: '1px solid #E5E7FF', borderRadius: 12, fontSize: 12, color: '#5A6080', lineHeight: 1.55, animation: 'onb-rise .5s ease' }}>
          <span aria-hidden style={{ flexShrink: 0, fontSize: 14 }}>💡</span>
          <span><strong style={{ color: '#1A1D2E' }}>Did you know?</strong> {TIPS[tip]}</span>
        </div>
      </div>
    </div>
  );
}
