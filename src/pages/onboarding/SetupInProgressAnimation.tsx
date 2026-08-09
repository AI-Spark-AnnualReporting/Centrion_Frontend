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
  'Booping', 'Splunking', 'Skedaddling', 'Noodling', 'Rummaging', 'Wrangling', 'Purring', 'Fiddling', 'Juggling', 'Plup-Fictioning', 'Doodling',
  'Percolating', 'Breakfast-clubbing', 'Tinkering', 'Untangling', 'Conjuring', 'Finagling',
  'Whittling', 'Simmering', 'Puttering', 'Schlepping', 'Bamboozling', 'Meowing',
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
  force = false,
  overlay = false,
}: {
  // null when this runs OUTSIDE onboarding (the Upload Reports page): onboarding is
  // already complete and there's no payload to submit, so completeOnboarding is
  // skipped entirely and we go straight to the dashboard once the ingest lands.
  payload: OnboardingPayload | null;
  files?: UploadedReportFile[];
  // Re-run an ingest that already finished — see ingest_onboarding_endpoint.
  force?: boolean;
  // Cover the app shell instead of stretching a 100vh block inside its content
  // column. Only the in-app page needs this; /onboarding is already shell-less.
  overlay?: boolean;
}) {
  const navigate = useNavigate();
  const { completeOnboarding, user } = useAuth();

  const [detail, setDetail] = useState('Getting your workspace ready…');
  const [percent, setPercent] = useState(0);
  const [gerund, setGerund] = useState(0);
  const [tip, setTip] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  const doneRef = useRef(false);
  // company_id may only land after completeOnboarding — keep the latest known one in a ref
  // so the poll never depends on a value that's null at mount.
  const companyIdRef = useRef<string | null>(user?.company_id ?? null);
  const payloadRef = useRef(payload);
  payloadRef.current = payload;
  const filesRef = useRef(files);
  filesRef.current = files;

  useEffect(() => {
    if (user?.company_id) companyIdRef.current = user.company_id;
  }, [user?.company_id]);

  const enterDashboard = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    navigate('/dashboard', { replace: true, state: { justUploaded: filesRef.current.length > 0 } });
  }, [navigate]);

  // One robust flow: complete onboarding → kick off the ingest → poll the REAL progress
  // (companies.onboarding_progress / report_extraction_status) → open the dashboard.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      const cid = companyIdRef.current;
      const items = filesRef.current
        .filter((f) => f.documentId)
        .map((f) => ({ document_id: f.documentId as string, doc_type: f.docType, period: f.period }));

      // Finalize onboarding (departments etc.) + open the dashboard. Run LAST so the
      // onboarding_completed flag — which makes ProtectedRoute redirect /onboarding →
      // /dashboard — only flips once the ingest is done and the dashboard is a fetch.
      const finalizeAndEnter = async () => {
        if (cancelled) return;
        setFinishing(true);
        setDetail('Setting up your workspace…');
        // No payload → not onboarding; there is nothing to finalize.
        if (payloadRef.current) {
          try {
            await completeOnboarding(payloadRef.current);
          } catch {
            /* still enter — onboarding is best-effort at this point */
          }
        }
        if (!cancelled) enterDashboard();
      };

      // Nothing to ingest → just finalize + enter.
      if (!cid || !items.length) {
        if (payloadRef.current) {
          try {
            await completeOnboarding(payloadRef.current);
          } catch (e) {
            if (!cancelled) setError(e instanceof Error ? e.message : 'Setup failed.');
            return;
          }
        }
        if (!cancelled) enterDashboard();
        return;
      }

      // Kick off the heavy ingest FIRST so the real backend stages show immediately
      // (onboarding stays "incomplete" meanwhile, so ProtectedRoute doesn't redirect).
      try {
        await companies.ingestOnboarding(cid, items, force);
      } catch {
        await finalizeAndEnter(); // couldn't start the ingest → don't trap the user
        return;
      }
      if (cancelled) return;

      const startedAt = Date.now();
      const poll = async () => {
        if (cancelled) return;
        try {
          const c = await companies.getMyCompany();
          if (cancelled) return;
          const prog = c.onboarding_progress;
          if (prog?.detail) setDetail(prog.detail);
          if (typeof prog?.percent === 'number') setPercent((p) => Math.max(p, prog.percent as number));
          if (c.report_extraction_status === 'done' || c.report_extraction_status === 'failed') {
            setPercent(100);
            await finalizeAndEnter();
            return;
          }
        } catch {
          /* transient — keep polling */
        }
        if (Date.now() - startedAt >= MAX_WAIT_MS) {
          await finalizeAndEnter();
          return;
        }
        timer = setTimeout(poll, 2000);
      };
      timer = setTimeout(poll, 1500);
    };

    run();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [retryTick, completeOnboarding, enterDashboard, force]);

  // Rotate the playful gerund + the tips (text updates in place — no remount).
  useEffect(() => {
    const g = setInterval(() => setGerund((n) => (n + 1) % GERUNDS.length), 3300);
    const t = setInterval(() => setTip((n) => (n + 1) % TIPS.length), 6000);
    return () => { clearInterval(g); clearInterval(t); };
  }, []);

  const retry = () => {
    doneRef.current = false;
    setError(null);
    setDetail('Getting your workspace ready…');
    setPercent(0);
    setFinishing(false);
    setRetryTick((t) => t + 1);
  };

  // Full-bleed on /onboarding (shell-less); a fixed overlay when it runs inside
  // AppLayout, so it covers the sidebar instead of stretching the content column.
  const rootFill: React.CSSProperties = overlay
    ? { position: 'fixed', inset: 0, zIndex: 1400 }
    : { minHeight: '100vh' };

  if (error) {
    return (
      <div style={{ ...rootFill, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F5FB', padding: 20 }}>
        <div className="card" style={{ maxWidth: 440, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#1A1D2E', marginBottom: 8 }}>Setup encountered an issue</div>
          <div style={{ fontSize: 12, color: '#5A6080', marginBottom: 18 }}>{error}</div>
          <button type="button" className="btn bp" onClick={retry}>Try again</button>
        </div>
      </div>
    );
  }

  const pct = Math.round(percent);

  return (
    <div style={{ ...rootFill, background: 'radial-gradient(120% 80% at 50% -10%, #EEEFFE 0%, #F4F5FB 45%, #F4F5FB 100%)', position: overlay ? 'fixed' : 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
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
        {/* One playful rotating word with a little spinner beside it — updates in place */}
        {!finishing && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, fontSize: 12.5, color: PRIMARY, fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
            <span className="proc-ring" style={{ width: 13, height: 13, borderWidth: 2, flexShrink: 0 }} />
            <span>{GERUNDS[gerund]}<span style={{ opacity: 0.6 }}>…</span></span>
          </div>
        )}

        <div style={{ position: 'relative', height: 9, background: '#E8EAF5', borderRadius: 9, overflow: 'hidden', margin: '22px 0 8px' }}>
          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 9, background: 'linear-gradient(90deg,#4040C8,#5BC9E2,#4040C8)', backgroundSize: '200% auto', animation: 'onb-sheen 1.6s linear infinite', transition: 'width .4s ease' }} />
        </div>
        <div style={{ fontSize: 12, color: '#5A6080', fontFamily: "'DM Mono', monospace", fontWeight: 700, marginBottom: 24 }}>
          {pct}% complete
        </div>

        <div style={{ display: 'flex', gap: 11, textAlign: 'left', padding: '13px 16px', background: 'linear-gradient(180deg,#FAFAFE,#F4F5FF)', border: '1px solid #E5E7FF', borderRadius: 12, fontSize: 12, color: '#5A6080', lineHeight: 1.55 }}>
          <span aria-hidden style={{ flexShrink: 0, fontSize: 14 }}>💡</span>
          <span><strong style={{ color: '#1A1D2E' }}>Did you know?</strong> {TIPS[tip]}</span>
        </div>
      </div>
    </div>
  );
}
