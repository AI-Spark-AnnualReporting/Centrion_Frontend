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
  // Surfaced as a chip on the row. Nothing is mandatory — the annual report is the
  // one that actually builds the dashboard, so it's called out, not enforced.
  recommended?: boolean;
}

const ROWS: RowDef[] = [
  { icon: '📊', title: 'Annual Report', desc: 'Most recent full-year report · PDF, DOCX up to 50 MB', docType: 'annual', recommended: true },
  { icon: '🌱', title: 'Sustainability / ESG Report', desc: 'GRI, TCFD or integrated report · PDF up to 50 MB', docType: 'esg' },
  { icon: '📈', title: 'Financial Statements', desc: 'Audited financials, P&L, balance sheet · PDF up to 50 MB', docType: 'financial' },
  { icon: '📋', title: 'Other Documents', desc: 'Board packs, governance docs, MD&A · any format', docType: 'other' },
];

// Per-slot validation state (annual/esg are LLM-checked; financial/other just banked).
type SlotState =
  | { status: 'validating' }
  | { status: 'ok'; result: ReportValidation }
  // Carries the result too: the backend banks a rejected file anyway, so the
  // document_id is there if the user overrides the verdict.
  | { status: 'invalid'; message: string; result: ReportValidation }
  | { status: 'error'; message: string };

// Label the confirmed report by the SLOT the user chose (not the classifier's
// detected_type — an integrated report can read as both annual & ESG).
function slotLabel(docType: ReportDocType): string {
  return docType === 'annual' ? 'Annual report' : docType === 'esg' ? 'ESG report' : 'Document';
}

function StatusLine({
  state, docType, overridden, onOverride,
}: {
  state: SlotState | undefined;
  docType: ReportDocType;
  overridden: boolean;
  onOverride: () => void;
}) {
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
  let msg: string;
  if (state.status === 'ok') {
    if (docType === 'annual' || docType === 'esg') {
      const lbl = slotLabel(docType);
      msg = state.result.period ? `${lbl} · ${state.result.period}` : `${lbl} confirmed`;
    } else {
      msg = state.result.message; // financial/other → "Ready."
    }
  } else {
    msg = state.message;
  }
  // An overridden slot reads as a caution, not an error — the file is being used.
  const color = ok || overridden ? (overridden ? '#B45309' : '#0F9D6B') : '#DC2626';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, fontSize: 11.5, fontWeight: 600, color, flexWrap: 'wrap' }}>
      <span style={{ flexShrink: 0 }}>{ok ? '✓' : '⚠️'}</span>
      <span style={{ minWidth: 0 }}>
        {overridden ? `${msg} Using it anyway.` : msg}
      </span>
      {/* The classifier can be wrong, and the annual slot is now mandatory — without
          this a false negative would leave the user unable to finish onboarding. */}
      {state.status === 'invalid' && !overridden && (
        <button
          type="button"
          onClick={onOverride}
          style={{
            padding: '2px 9px', borderRadius: 999, cursor: 'pointer',
            border: '1px solid #C7CBF0', background: '#fff',
            fontSize: 11, fontWeight: 700, color: '#4040C8', fontFamily: 'inherit',
          }}
        >
          Use it anyway
        </button>
      )}
    </div>
  );
}

function UploadRow({
  row, file, state, onPick, overridden, onOverride,
}: {
  row: RowDef;
  file: File | null;
  state: SlotState | undefined;
  onPick: (f: File | null) => void;
  overridden: boolean;
  onOverride: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="ob-up-row">
      <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{row.icon}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1A1D2E' }}>{row.title}</span>
          {row.recommended && <span className="ob-req">Recommended</span>}
        </div>
        <div style={{ fontSize: 11.5, color: '#9BA3C4', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {file ? file.name : row.desc}
        </div>
        <StatusLine
          state={state}
          docType={row.docType}
          overridden={overridden}
          onOverride={onOverride}
        />
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
  // Omitted by the standalone Upload Reports page — there's nothing to skip past
  // there, the user chose to open it.
  onSkip,
  submitLabel,
  docTypes,
}: {
  onProcess: (files: UploadedReportFile[]) => void;
  onSkip?: () => void;
  submitLabel?: string;
  // Which slots to render. Omitted (onboarding) => all four. The in-app page passes
  // ['annual','esg'] because the ingest only ever reads those two — the other slots
  // just bank a file nothing downstream looks at.
  docTypes?: ReportDocType[];
}) {
  const rows = docTypes ? ROWS.filter((r) => docTypes.includes(r.docType)) : ROWS;
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;
  const [picked, setPicked] = useState<Record<string, File | null>>({});
  const [states, setStates] = useState<Record<string, SlotState | undefined>>({});
  // Slots where the user chose to use a file the classifier rejected.
  const [overridden, setOverridden] = useState<Record<string, boolean>>({});

  const handlePick = (row: RowDef, f: File | null) => {
    setPicked((prev) => ({ ...prev, [row.title]: f }));
    setStates((prev) => ({ ...prev, [row.title]: f ? { status: 'validating' } : undefined }));
    // A new file gets a fresh verdict — never inherit the last file's override.
    setOverridden((prev) => ({ ...prev, [row.title]: false }));
    if (!f || !companyId) return;
    companies
      .validateReport(companyId, f, row.docType)
      .then((res) => {
        setStates((prev) => ({
          ...prev,
          [row.title]:
            (row.docType === 'annual' || row.docType === 'esg') && !res.valid
              ? { status: 'invalid', message: res.message, result: res }
              : res.document_id
                ? { status: 'ok', result: res }
                : { status: 'error', message: 'Upload failed — please try again.' },
        }));
      })
      .catch(() => setStates((prev) => ({ ...prev, [row.title]: { status: 'error', message: 'Upload failed — please try again.' } })));
  };

  const anyValidating = Object.values(states).some((s) => s?.status === 'validating');
  // A rejected file still blocks — "Use it anyway" is the way past a classifier
  // false negative. Nothing else is required.
  const blockingInvalid = rows.some(
    (r) => states[r.title]?.status === 'invalid' && !overridden[r.title],
  );
  const canProcess = !!companyId && !anyValidating && !blockingInvalid;

  const collected: UploadedReportFile[] = rows
    .map((r) => {
      const st = states[r.title];
      const f = picked[r.title];
      if (!f || !st) return null;
      if (st.status === 'ok') {
        return { file: f, docType: r.docType, documentId: st.result.document_id, period: st.result.period };
      }
      // Overridden slots must reach onProcess too — an empty list would drop the
      // user back to the welcome dashboard instead of the workspace one.
      if (st.status === 'invalid' && overridden[r.title]) {
        return { file: f, docType: r.docType, documentId: st.result.document_id, period: st.result.period };
      }
      return null;
    })
    .filter((x): x is UploadedReportFile => !!x);

  return (
    <>
      <h2>Upload Your Reports</h2>
      <p>
        The more you upload, the smarter your workspace becomes — your annual report is the one we
        build the dashboard from. Add more later anytime.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
        {rows.map((r) => (
          <UploadRow
            key={r.title}
            row={r}
            file={picked[r.title] ?? null}
            state={states[r.title]}
            onPick={(f) => handlePick(r, f)}
            overridden={!!overridden[r.title]}
            onOverride={() => setOverridden((prev) => ({ ...prev, [r.title]: true }))}
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
        {anyValidating ? 'Checking your documents…' : submitLabel ?? 'Process Reports & Build Dashboard →'}
      </button>

      {onSkip && (
        <button type="button" className="ob-skip" onClick={onSkip}>
          Skip for now — upload from your dashboard later
        </button>
      )}
    </>
  );
}
