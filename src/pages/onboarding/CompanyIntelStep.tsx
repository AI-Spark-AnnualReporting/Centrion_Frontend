import { useRef, useState } from 'react';

const ACCEPTED_EXTS = ['pdf', 'docx'];
const MAX_MB = 50;

// Step 1 — document-only. Shown when there's no extracted data yet: either the
// admin gave nothing at signup (normal manual onboarding), or their website
// couldn't be scraped (`urlFailed`). They upload a profile doc to auto-fill, or
// fall through to filling the Review form by hand.
export default function CompanyIntelStep({
  onAnalyse,
  onSkipManual,
  serverError,
  urlFailed,
}: {
  onAnalyse: (file: File | null) => void;
  onSkipManual: () => void;
  serverError?: string | null;
  urlFailed?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
    setFile(f);
  };

  // One document only — extraction is a single LLM call, so a second file would
  // double the cost for no benefit. A multi-file drop is rejected rather than
  // silently reduced to the first: we can't know which one was meant.
  const pickDropped = (list: FileList | null) => {
    if (list && list.length > 1) {
      setFile(null);
      setError('One document at a time — please drop a single file.');
      return;
    }
    pickFile(list?.[0] ?? null);
  };

  const handleAnalyse = () => {
    if (!file) {
      setError('Upload a document, or fill the details in manually below.');
      return;
    }
    setError(null);
    onAnalyse(file);
  };

  return (
    <>
      <h2>{urlFailed ? "We couldn't read your website" : 'Set Up Your Workspace'}</h2>
      <p>
        {urlFailed
          ? "We couldn't pull your details from your website. Upload a company profile document and we'll extract them — or just fill them in manually."
          : "Upload a company profile document and we'll auto-fill your details — or fill them in manually."}
      </p>

      <div
        className={`ob-drop${dragOver ? ' over' : ''}`}
        style={{ marginTop: 10 }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          pickDropped(e.dataTransfer.files);
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
              One file — PDF or DOCX, up to 50 MB
            </div>
          </>
        )}
        <button type="button" className="ob-browse" onClick={() => inputRef.current?.click()}>
          {file ? 'Replace file' : 'Browse file'}
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
        Analyse Document →
      </button>

      <button type="button" className="ob-skip" onClick={onSkipManual}>
        {urlFailed ? 'Fill in manually instead' : 'Skip and fill in manually'}
      </button>
    </>
  );
}
