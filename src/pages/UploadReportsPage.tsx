import { useState } from 'react';
import UploadReportsStep, { type UploadedReportFile } from '@/pages/onboarding/UploadReportsStep';
import SetupInProgressAnimation from '@/pages/onboarding/SetupInProgressAnimation';

// The onboarding upload step, reachable from inside the app.
//
// Onboarding's last step can be skipped, which leaves the company with no
// documents and the dashboard on its welcome screen. This page is the way back
// to it — same form, same ingest, same loader, same landing on the dashboard —
// and it also serves adding more documents later.
//
// Two things make it differ from the onboarding run:
//   - no `payload`, because onboarding is already complete and there is nothing
//     to finalize (SetupInProgressAnimation skips completeOnboarding on null);
//   - `force`, because the backend no-ops an ingest once one has finished.
export default function UploadReportsPage() {
  const [running, setRunning] = useState<UploadedReportFile[] | null>(null);

  if (running) {
    return (
      <SetupInProgressAnimation
        payload={null}
        files={running}
        force
        overlay
      />
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>Upload Reports</h2>
        <p style={{ fontSize: 11, color: '#5A6080', marginTop: 2 }}>
          Add your company reports and we&rsquo;ll rebuild your dashboard from them.
        </p>
      </div>

      <div className="card" style={{ padding: '22px 24px' }}>
        <UploadReportsStep
          submitLabel="Process Reports & Rebuild Dashboard →"
          onProcess={(files) => {
            // Same flag onboarding sets, so the dashboard shows the workspace view
            // immediately instead of racing the documents query behind hasDocs.
            if (files.length) sessionStorage.setItem('centriyon:freshUpload', '1');
            setRunning(files);
          }}
        />
      </div>
    </div>
  );
}
