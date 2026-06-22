import { useRef, useState } from 'react';

// Step 1 — "Set Up Your Workspace". Visual only: collects a website URL or an
// uploaded company profile, then hands off to the Analysing loader (onAnalyse)
// or lets the user fill the form by hand (onSkipManual).
export default function CompanyIntelStep({
  onAnalyse,
  onSkipManual,
}: {
  onAnalyse: () => void;
  onSkipManual: () => void;
}) {
  const [website, setWebsite] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <h2>Set Up Your Workspace</h2>
      <p>Paste your website URL or upload a company profile — our AI will extract the details.</p>

      <div className="fl" style={{ marginTop: 8 }}>
        <label>Company website</label>
        <input
          type="text"
          className="inp"
          placeholder="https://www.yourcompany.com"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <div className="ob-or">
        <span>or upload a file</span>
      </div>

      <div
        className={`ob-drop${dragOver ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.[0]) setFile(e.dataTransfer.files[0]);
        }}
      >
        <div style={{ fontSize: 30, lineHeight: 1 }}>📁</div>
        {file ? (
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1D2E' }}>{file.name}</div>
        ) : (
          <>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1D2E', marginTop: 8 }}>
              Drop your company profile here
            </div>
            <div style={{ fontSize: 12, color: '#9BA3C4', marginTop: 4 }}>
              PDF, DOCX, PPTX — up to 20 MB
            </div>
          </>
        )}
        <button type="button" className="ob-browse" onClick={() => inputRef.current?.click()}>
          {file ? 'Replace file' : 'Browse files'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.pptx"
          style={{ display: 'none' }}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <button type="button" className="btn-auth" style={{ marginTop: 20 }} onClick={onAnalyse}>
        Analyse Company →
      </button>

      <div style={{ textAlign: 'center', fontSize: 12, color: '#9BA3C4', marginTop: 14 }}>
        Takes ~10 seconds ·{' '}
        <button
          type="button"
          onClick={onSkipManual}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#5A6080', fontWeight: 600, textDecoration: 'underline' }}
        >
          Skip and fill manually
        </button>
      </div>
    </>
  );
}
