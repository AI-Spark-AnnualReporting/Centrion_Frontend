import { useRef, useState } from 'react';

interface RowDef {
  icon: string;
  title: string;
  desc: string;
  required?: boolean;
}

const ROWS: RowDef[] = [
  { icon: '📊', title: 'Annual Report', desc: 'Most recent full-year report · PDF, DOCX up to 50 MB', required: true },
  { icon: '🌱', title: 'Sustainability / ESG Report', desc: 'GRI, TCFD or integrated report · PDF up to 50 MB' },
  { icon: '📈', title: 'Financial Statements', desc: 'Audited financials, P&L, balance sheet · PDF up to 50 MB' },
  { icon: '📋', title: 'Other Documents', desc: 'Board packs, governance docs, MD&A · any format' },
];

function UploadRow({ row, file, onPick }: { row: RowDef; file: File | null; onPick: (f: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="ob-up-row">
      <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{row.icon}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1A1D2E' }}>{row.title}</span>
          {row.required && <span className="ob-req">Required</span>}
        </div>
        <div style={{ fontSize: 11.5, color: '#9BA3C4', marginTop: 2 }}>
          {file ? file.name : row.desc}
        </div>
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

// Step 4 — collects the report documents. "Process" hands the picked files up
// (uploaded to the Document Bank + run through report-style extraction, then the
// new workspace dashboard opens); "Skip" passes nothing (→ welcome dashboard).
export default function UploadReportsStep({
  onProcess,
  onSkip,
}: {
  onProcess: (files: File[]) => void;
  onSkip: () => void;
}) {
  const [picked, setPicked] = useState<Record<string, File | null>>({});
  const collected = ROWS.map((r) => picked[r.title]).filter((f): f is File => !!f);

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
            onPick={(f) => setPicked((prev) => ({ ...prev, [r.title]: f }))}
          />
        ))}
      </div>

      <button type="button" className="btn-auth" style={{ marginTop: 20 }} onClick={() => onProcess(collected)}>
        Process Reports &amp; Build Dashboard →
      </button>

      <button type="button" className="ob-skip" onClick={onSkip}>
        Skip for now — upload from your dashboard later
      </button>
    </>
  );
}
