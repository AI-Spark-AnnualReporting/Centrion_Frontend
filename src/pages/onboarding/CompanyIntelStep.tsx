import { useRef, useState } from 'react';

const ACCEPTED_EXTS = ['pdf', 'docx'];
const MAX_MB = 50;

// Step 1 — "Set Up Your Workspace". Collects a website URL or an uploaded
// company-profile document (PDF/DOCX only), then hands the file up to be analysed
// (onAnalyse) or lets the user fill the form by hand (onSkipManual).
export default function CompanyIntelStep({
  onAnalyse,
  onSkipManual,
  serverError,
}: {
  onAnalyse: (file: File | null, url: string) => void;
  onSkipManual: () => void;
  serverError?: string | null;
}) {
  const [website, setWebsite] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false); // mandatory check failed (neither input)
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // At least one of {document, URL} is required.
  const handleAnalyse = () => {
    const url = website.trim();
    if (!file && !url) {
      setError('Upload a document or enter your website URL.');
      setInvalid(true);
      return;
    }
    setError(null);
    setInvalid(false);
    onAnalyse(file, url);
  };

  const pickFile = (f: File | null) => {
    if (!f) {
      setFile(null);
      return;
    }
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ACCEPTED_EXTS.includes(ext)) {
      setError('Only PDF and DOCX files are supported.');
      setFile(null);
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`File is too large (max ${MAX_MB} MB).`);
      setFile(null);
      return;
    }
    setError(null);
    setInvalid(false);
    setFile(f);
  };

  return (
    <>
      <h2>Set Up Your Workspace</h2>
      <p>Paste your website URL or upload a company profile — our AI will extract the details.</p>

      <div className="fl" style={{ marginTop: 8 }}>
        <label>Company website</label>
        <input
          type="text"
          className={`inp${invalid ? ' inp-error' : ''}`}
          placeholder="https://www.yourcompany.com"
          value={website}
          onChange={(e) => { setWebsite(e.target.value); setInvalid(false); }}
        />
      </div>

      <div className="ob-or">
        <span>or upload a file</span>
      </div>

      <div
        className={`ob-drop${dragOver ? ' over' : ''}`}
        style={{ borderColor: invalid ? '#E5484D' : undefined }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          pickFile(e.dataTransfer.files?.[0] ?? null);
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
              PDF, DOCX — up to 50 MB
            </div>
          </>
        )}
        <button type="button" className="ob-browse" onClick={() => inputRef.current?.click()}>
          {file ? 'Replace file' : 'Browse files'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx"
          style={{ display: 'none' }}
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {(error || serverError) && (
        <div style={{ fontSize: 12, color: '#E5484D', marginTop: 10, fontWeight: 600 }} role="alert">
          {error || serverError}
        </div>
      )}

      <button type="button" className="btn-auth" style={{ marginTop: 20 }} onClick={handleAnalyse}>
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
