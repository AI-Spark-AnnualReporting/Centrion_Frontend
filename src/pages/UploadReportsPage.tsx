import { useRef, useState } from 'react';
import UploadReportsStep, { type UploadedReportFile } from '@/pages/onboarding/UploadReportsStep';
import UploadedReportsList from '@/components/reports/UploadedReportsList';
import AnnualReportExtraction from '@/components/reports/AnnualReportExtraction';
import { companies as companiesApi } from '@/lib/api';
import type { OnboardingIngestItem } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

// The onboarding upload step, reachable from inside the app.
//
// Onboarding's last step can be skipped, which leaves the company with no
// documents and the dashboard on its welcome screen. This page is the way back
// to it, and it also serves adding more documents later.
//
// Unlike onboarding, this page does NOT hand over to the full-screen setup
// animation. It starts the ingest itself and stays on screen, so the user watches
// the table below fill in row by row and sees any step that failed, with its reason.
// `force` is always sent, because the backend no-ops an ingest once one has finished.

const NO_FILES_TEXT = 'Add at least one report before processing.';
const START_FAILED_TEXT = 'We could not start reading your reports. Please check your connection and try again.';

/** Turns the form's validated files into the list the ingest endpoint expects. */
function toIngestItems(files: UploadedReportFile[]): OnboardingIngestItem[] {
  const items: OnboardingIngestItem[] = [];
  for (const file of files) {
    if (!file.documentId) continue;
    items.push({ document_id: file.documentId, doc_type: file.docType, period: file.period });
  }
  return items;
}

/** Scrolls the live table into view, without the glide for reduced motion. */
function scrollToTable(element: HTMLElement | null) {
  if (!element || typeof element.scrollIntoView !== 'function') return;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  element.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}

/** The Upload Reports page: the form, the uploaded list, and the live extraction table. */
export default function UploadReportsPage() {
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;
  // `starting` covers the kick-off request; `runActive` covers the run itself and is
  // driven by the table, which is also how a run started before this visit is noticed.
  const [starting, setStarting] = useState(false);
  const [runActive, setRunActive] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [listKey, setListKey] = useState(0);
  const runActiveRef = useRef(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const busy = starting || runActive;

  /** Records whether a run is going; reloads the uploaded list when one ends. */
  function handleRunningChange(running: boolean) {
    const wasRunning = runActiveRef.current;
    runActiveRef.current = running;
    setRunActive(running);
    if (wasRunning && !running) setListKey((key) => key + 1);
  }

  /** Starts the ingest for the validated files and points the user at the table. */
  async function startProcessing(files: UploadedReportFile[]) {
    if (!companyId || busy) return;
    const items = toIngestItems(files);
    if (items.length === 0) {
      setStartError(NO_FILES_TEXT);
      return;
    }
    setStartError(null);
    setStarting(true);
    try {
      await companiesApi.ingestOnboarding(companyId, items, true);
      // Same flag onboarding sets, so the dashboard shows the workspace view
      // immediately instead of racing the documents query behind hasDocs.
      sessionStorage.setItem('centriyon:freshUpload', '1');
      handleRunningChange(true);
      setRunKey((key) => key + 1);
      scrollToTable(tableRef.current);
    } catch {
      setStartError(START_FAILED_TEXT);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>Upload Reports</h2>
        <p style={{ fontSize: 11, color: '#5A6080', marginTop: 2 }}>
          Add your company reports and we&rsquo;ll rebuild your dashboard from them.
        </p>
      </div>

      <div className="card" aria-busy={busy} style={{ padding: '22px 24px' }}>
        <UploadReportsStep
          submitLabel="Process Reports & Update Dashboard →"
          // Only the annual/ESG slots here: the ingest reads nothing else, so offering
          // the financial/other slots would promise processing that never happens.
          // Onboarding passes no docTypes and keeps all four.
          docTypes={['annual', 'esg']}
          disabled={busy}
          disabledLabel={starting ? 'Starting…' : 'Reading your reports… see the progress below'}
          onProcess={startProcessing}
        />
        {startError && (
          <p
            role="alert"
            style={{
              marginTop: 12, fontSize: 12, fontWeight: 600, color: '#DC2626',
              background: '#FDECEC', borderRadius: 10, padding: '9px 12px',
            }}
          >
            {startError}
          </p>
        )}
      </div>

      <UploadedReportsList refreshKey={listKey} />

      <div ref={tableRef} style={{ scrollMarginTop: 16 }}>
        <AnnualReportExtraction refreshKey={runKey} onRunningChange={handleRunningChange} />
      </div>
    </div>
  );
}
