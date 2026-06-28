import { useRef, useState } from 'react';
import type { StepTwoState } from '@/types/register';

interface StepTwoFormProps {
  initialValues: StepTwoState;
  onSubmit: (data: StepTwoState) => void;
  onBack: () => void;
  error: string;
  loading: boolean;
}

const JURISDICTIONS = ['KSA', 'UAE', 'Bahrain', 'Kuwait', 'Oman', 'Qatar', 'Other'];

function Spinner() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      style={{ marginRight: 8, animation: 'spin 1s linear infinite' }}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}

export function StepTwoForm({
  initialValues,
  onSubmit,
  onBack,
  error,
  loading,
}: StepTwoFormProps) {
  const [companyName, setCompanyName] = useState(initialValues.companyName);
  const [jurisdiction, setJurisdiction] = useState(initialValues.jurisdiction || 'KSA');
  const [website, setWebsite] = useState(initialValues.website ?? '');
  const [file, setFile] = useState<File | null>(initialValues.file ?? null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pickFile = (f: File | null) => {
    if (!f) { setFile(null); return; }
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['pdf', 'docx'].includes(ext)) {
      setFileError('Only PDF and DOCX files are supported.');
      setFile(null);
      return;
    }
    setFileError(null);
    setFile(f);
  };

  const handleCreate = () => {
    if (loading) return;
    onSubmit({ companyName, jurisdiction, website: website.trim(), file });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCreate();
  };

  return (
    <>
      <div className="fl">
        <label>Company name</label>
        <input
          type="text"
          className="inp"
          placeholder="e.g. Al-Noor Capital"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>

      <div className="fl">
        <label>Jurisdiction</label>
        <select
          className="inp sel"
          value={jurisdiction}
          onChange={(e) => setJurisdiction(e.target.value)}
        >
          {JURISDICTIONS.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>
      </div>

      <div className="fl">
        <label>Company website <span style={{ color: '#9BA3C4', fontWeight: 500 }}>(optional)</span></label>
        <input
          type="text"
          className="inp"
          placeholder="https://www.yourcompany.com"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>

      <div className="fl">
        <label>Company profile document <span style={{ color: '#9BA3C4', fontWeight: 500 }}>(optional · PDF / DOCX)</span></label>
        {file ? (
          <div className="upload-z" style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '13px 16px', borderColor: '#4040C8', background: 'rgba(64,64,200,.04)' }}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M12 2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6z" stroke="#4040C8" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M12 2v4h4" stroke="#4040C8" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: '#1A1D2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
            <button type="button" onClick={() => inputRef.current?.click()} style={{ fontSize: 11, fontWeight: 700, color: '#4040C8', background: 'transparent', border: 'none', cursor: 'pointer' }}>Replace</button>
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0] ?? null); }}
            className="upload-z"
            style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '14px 16px', cursor: 'pointer', borderColor: dragOver ? '#4040C8' : undefined, background: dragOver ? 'rgba(64,64,200,.06)' : undefined }}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M10 3v10M6 7l4-4 4 4" stroke="#9BA3C4" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M3 14v2a2 2 0 002 2h10a2 2 0 002-2v-2" stroke="#9BA3C4" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 12, color: '#5A6080' }}>Click to upload or drag &amp; drop — PDF, DOCX</span>
          </div>
        )}
        <input ref={inputRef} type="file" accept=".pdf,.docx" style={{ display: 'none' }} onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
        <p style={{ fontSize: 10.5, color: '#9BA3C4', marginTop: 6 }}>
          We'll read your website / document to pre-fill your company details — review them after signing in.
        </p>
        {fileError && <div style={{ fontSize: 11, color: '#E5484D', marginTop: 4, fontWeight: 600 }} role="alert">{fileError}</div>}
      </div>

      {error && (
        <div style={{ fontSize: '11px', color: '#E5484D', marginTop: '4px', marginBottom: '8px' }} role="alert">
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          style={{
            padding: '10px 14px',
            fontSize: 12,
            fontWeight: 600,
            color: '#5A6080',
            background: 'transparent',
            border: '1px solid #E5E7EF',
            borderRadius: 8,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          ← Back
        </button>
        <button
          type="button"
          className="btn-auth"
          onClick={handleCreate}
          disabled={loading}
          style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {loading ? (
            <>
              <Spinner />
              Creating account…
            </>
          ) : (
            'Create Account →'
          )}
        </button>
      </div>
    </>
  );
}

export default StepTwoForm;
