import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import type { OnboardingPayload } from '@/types/auth';
import { companies } from '@/lib/api';
import type { UploadedReportFile } from '@/pages/onboarding/UploadReportsStep';
import AiLoadingScreen from '@/pages/onboarding/AiLoadingScreen';

const SETUP_MILESTONES = [
  'Setting up your company workspace',
  'Configuring your reporting frameworks',
  'Creating AI agents for your departments',
  'Finalizing your dashboard',
];

// Final onboarding step — fires the real onboarding API and shows the shared
// AI-circles loader while it runs. If the admin uploaded report documents, they
// are saved to the Document Bank + run through report-style extraction here,
// then we open the new workspace dashboard; otherwise the welcome dashboard.
export default function SetupInProgressAnimation({
  payload,
  files = [],
}: {
  payload: OnboardingPayload;
  files?: UploadedReportFile[];
}) {
  const navigate = useNavigate();
  const { completeOnboarding, user } = useAuth();
  const [apiComplete, setApiComplete] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const firedRef = useRef(false);

  // Fire (or re-fire) the onboarding completion. Retry reuses this so the user's
  // Review selections (carried in `payload`) are never lost. After completion,
  // upload any report docs + kick off report-style extraction (both non-fatal).
  const fire = useCallback(() => {
    setApiError(null);
    setApiComplete(false);
    completeOnboarding(payload)
      .then(async () => {
        const companyId = user?.company_id;
        if (files.length && companyId) {
          const justFiles = files.map((f) => f.file);
          const docTypes = files.map((f) => f.docType);
          // Single store-only + extract call: the backend saves each doc to the
          // Document Bank and extracts tone/themes/frameworks — no heavy GRI
          // pipeline. Non-fatal: still open the dashboard if it fails.
          try {
            await companies.extractReportStyle(companyId, justFiles, docTypes);
          } catch {
            // ignore — docs can be re-uploaded later
          }
        }
        setApiComplete(true);
      })
      .catch((e) => setApiError(e instanceof Error ? e.message : 'Setup failed.'));
  }, [completeOnboarding, payload, files, user?.company_id]);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    fire();
  }, [fire]);

  if (apiError) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F5FB', padding: 20 }}>
        <div className="card" style={{ maxWidth: 440, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#1A1D2E', marginBottom: 8 }}>Setup encountered an issue</div>
          <div style={{ fontSize: 12, color: '#5A6080', marginBottom: 18 }}>{apiError}</div>
          <button type="button" className="btn bp" onClick={fire}>Try again</button>
        </div>
      </div>
    );
  }

  return (
    <AiLoadingScreen
      title="Processing Your Reports"
      subtitle="Building your intelligence dashboard from your documents."
      doneTitle="Your workspace is ready"
      doneSubtitle="Taking you to your dashboard…"
      milestones={SETUP_MILESTONES}
      done={apiComplete}
      onDone={() => navigate('/dashboard', { replace: true, state: { justUploaded: files.length > 0 } })}
    />
  );
}
