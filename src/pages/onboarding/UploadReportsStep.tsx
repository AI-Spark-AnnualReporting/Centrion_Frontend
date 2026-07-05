import { useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { companies } from '@/lib/api';
import type { ReportValidation } from '@/lib/api';

// Doc-type label sent to the backend so it can apply the source rules (annual/esg →
// report row + chunks + dashboard data; financial statements & other → Document Bank).
export type ReportDocType = 'annual' | 'esg' | 'financial' | 'other';

export interface UploadedReportFile {
  file: File;
  docType: ReportDocType;
  // Filled by the inline validation step: the banked doc + detected period the submit
  // step processes. Only slots that validated OK are handed to onProcess.
  documentId: string | null;
  period: string | null;
}

interface RowDef {
  icon: string;
  title: string;
  desc: string;
  docType: ReportDocType;
  required?: boolean;
}

const ROWS: RowDef[] = [
  { icon: '📊', title: 'Annual Report', desc: 'Most recent full-year report · PDF, DOCX up to 50 MB', docType: 'annual', required: true },
  { icon: '🌱', title: 'Sustainability / ESG Report', desc: 'GRI, TCFD or integrated report · PDF up to 50 MB', docType: 'esg' },
  { icon: '📈', title: 'Financial Statements', desc: 'Audited financials, P&L, balance sheet · PDF up to 50 MB', docType: 'financial' },
  { icon: '📋', title: 'Other Documents', desc: 'Board packs, governance docs, MD&A · any format', docType: 'other' },
];

// Per-slot validation state (annual/esg are LLM-checked; financial/other just banked).
type SlotState =
  | { status: 'validating' }
  | { status: 'ok'; result: ReportValidation }
  | { status: 'invalid'; message: string }
  | { status: 'error'; message: string };

function StatusLine({ state }: { state: SlotState | undefined }) {
  if (!state) return null;
  if (state.status === 'validating') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5, fontSize: 11.5, color: '#5A6080' }}>
        <span className="proc-ring" style={{ width: 13, height: 13, borderWidth: 2, flexShrink: 0 }} />
        Checking your document…
      </div>
    );
  }
  const ok = state.status === 'ok';
  const msg = state.status === 'ok'
    ? (state.result.period ? `${labelFor(state.result.detected_type)} · ${state.result.period}` : state.result.message)
    : state.message;
  const color = ok ? '#0F9D6B' : '#DC2626';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, fontSize: 11.5, fontWeight: 600, color }}>
      <span style={{ flexShrink: 0 }}>{ok ? '✓' : '⚠️'}</span>
      <span style={{ minWidth: 0 }}>{msg}</span>
    </div>
  );
}

function labelFor(detected: string): string {
  return detected === 'annual' ? 'Annual report' : detected === 'esg' ? 'ESG report' : 'Document';
}

function UploadRow({
  row, file, state, onPick,
}: {
  row: RowDef;
  file: File | null;
  state: SlotState | undefined;
  onPick: (f: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="ob-up-row">
      <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{row.icon}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1A1D2E' }}>{row.title}</span>
          {row.required && <span className="ob-req">Required</span>}
        </div>
        <div style={{ fontSize: 11.5, color: '#9BA3C4', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {file ? file.name : row.desc}
        </div>
        <StatusLine state={state} />
      </div>
      <button type="button" className="ob-upload-btn" onClick={() => inputRef.current?.click()}>
        {file ? 'Replace' : 'Upload'}
      </button>
      <input
        ref={inputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

// Step 4 — collects the report documents. Each Annual/ESG file is validated + banked the
// moment it's attached (LLM: is this really that report + which fiscal year), so we can
// warn on a wrong-slot upload and skip asking for the period. "Process" hands the
// validated docs up (→ heavy ingest + the live setup screen); "Skip" passes nothing.
export default function UploadReportsStep({
  onProcess,
  onSkip,
}: {
  onProcess: (files: UploadedReportFile[]) => void;
  onSkip: () => void;
}) {
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;
  const [picked, setPicked] = useState<Record<string, File | null>>({});
  const [states, setStates] = useState<Record<string, SlotState | undefined>>({});

  const handlePick = (row: RowDef, f: File | null) => {
    setPicked((prev) => ({ ...prev, [row.title]: f }));
    setStates((prev) => ({ ...prev, [row.title]: f ? { status: 'validating' } : undefined }));
    if (!f || !companyId) return;
    companies
      .validateReport(companyId, f, row.docType)
      .then((res) => {
        setStates((prev) => ({
          ...prev,
          [row.title]:
            (row.docType === 'annual' || row.docType === 'esg') && !res.valid
              ? { status: 'invalid', message: res.message }
              : res.document_id
                ? { status: 'ok', result: res }
                : { status: 'error', message: 'Upload failed — please try again.' },
        }));
      })
      .catch(() => setStates((prev) => ({ ...prev, [row.title]: { status: 'error', message: 'Upload failed — please try again.' } })));
  };

  const anyValidating = Object.values(states).some((s) => s?.status === 'validating');
  const anyInvalid = Object.values(states).some((s) => s?.status === 'invalid');
  const canProcess = !!companyId && !anyValidating && !anyInvalid;

  const collected: UploadedReportFile[] = ROWS
    .map((r) => {
      const st = states[r.title];
      const f = picked[r.title];
      if (!f || st?.status !== 'ok') return null;
      return { file: f, docType: r.docType, documentId: st.result.document_id, period: st.result.period };
    })
    .filter((x): x is UploadedReportFile => !!x);

  return (
    <>
      <h2>Upload Your Reports</h2>
      <p>The more you upload, the smarter your workspace becomes. Add more later anytime.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
        {ROWS.map((r) => (
          <UploadRow
            key={r.title}
            row={r}
            file={picked[r.title] ?? null}
            state={states[r.title]}
            onPick={(f) => handlePick(r, f)}
          />
        ))}
      </div>

      <button
        type="button"
        className="btn-auth"
        style={{ marginTop: 20, opacity: canProcess ? 1 : 0.55, cursor: canProcess ? 'pointer' : 'not-allowed' }}
        disabled={!canProcess}
        onClick={() => canProcess && onProcess(collected)}
      >
        {anyValidating ? 'Checking your documents…' : 'Process Reports & Build Dashboard →'}
      </button>

      <button type="button" className="ob-skip" onClick={onSkip}>
        Skip for now — upload from your dashboard later
      </button>
    </>
  );
}
