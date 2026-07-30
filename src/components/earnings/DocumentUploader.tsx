import { useRef, useState } from 'react';
import { INK, MUTED, FAINT, ACCENT, DANGER } from './tokens';

// Reusable drag/drop + file-chip uploader. Extracted so the Earnings source
// picker doesn't duplicate the quarterly form's inline uploader. No per-file
// language check (earnings doesn't require it).
const DEFAULT_ACCEPT = ['.pdf', '.docx', '.xlsx', '.csv'] as const;

function hasAcceptedExt(name: string, exts: readonly string[]): boolean {
  const lower = name.toLowerCase();
  return exts.some((ext) => lower.endsWith(ext));
}
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
const fileKey = (f: File) => `${f.name}:${f.size}`;

export function DocumentUploader({
  files,
  onFilesChange,
  accept = DEFAULT_ACCEPT,
  maxFiles = 5,
  disabled = false,
}: {
  files: File[];
  onFilesChange: (files: File[]) => void;
  accept?: readonly string[];
  maxFiles?: number;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  const accepts = (incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    const good: File[] = [];
    let rejected = false;
    list.forEach((f) => (hasAcceptedExt(f.name, accept) ? good.push(f) : (rejected = true)));
    setError(rejected ? `Unsupported file type. Allowed: ${accept.join(', ')}.` : null);
    if (good.length === 0) return;
    const seen = new Set(files.map(fileKey));
    const merged = [...files];
    good.forEach((f) => {
      const id = fileKey(f);
      if (!seen.has(id)) {
        seen.add(id);
        merged.push(f);
      }
    });
    onFilesChange(merged.slice(0, maxFiles));
    if (merged.length > maxFiles) setError(`Up to ${maxFiles} documents. Extra files were dropped.`);
  };

  const removeAt = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
    setError(null);
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept.join(',')}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) accepts(e.target.files);
          e.target.value = '';
        }}
        style={{ display: 'none' }}
      />

      <div
        role="button"
        tabIndex={0}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !isDragging) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (!disabled && e.dataTransfer.files.length > 0) accepts(e.dataTransfer.files);
        }}
        className="upload-z"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          textAlign: 'left',
          padding: '16px 20px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          borderColor: isDragging ? ACCENT : undefined,
          background: isDragging ? 'rgba(64,64,200,.06)' : undefined,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 3v10M6 7l4-4 4 4" stroke={FAINT} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M3 14v2a2 2 0 002 2h10a2 2 0 002-2v-2" stroke={FAINT} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: 12, color: MUTED }}>
          Click to upload or drag &amp; drop financial statements, earnings release, prior-period report
          <span style={{ color: FAINT }}> ({accept.join(', ').toUpperCase()} — up to {maxFiles})</span>
        </span>
      </div>

      {files.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
          {files.map((file, index) => (
            <div
              key={`${file.name}:${file.size}:${index}`}
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: '10px 10px 8px',
                borderRadius: 8,
                border: `1px solid ${ACCENT}`,
                background: 'rgba(64,64,200,.04)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <path d="M12 2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6z" stroke={ACCENT} strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M12 2v4h4" stroke={ACCENT} strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
              <div style={{ minWidth: 0, paddingRight: 16 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: INK,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {file.name}
                </div>
                <div style={{ fontSize: 10, color: FAINT, marginTop: 2 }}>{formatBytes(file.size)}</div>
              </div>
              <button
                type="button"
                onClick={() => removeAt(index)}
                aria-label={`Remove ${file.name}`}
                title="Remove file"
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  width: 16,
                  height: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 0,
                  padding: 0,
                  cursor: 'pointer',
                  color: FAINT,
                }}
              >
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div role="alert" style={{ fontSize: 11, color: DANGER, marginTop: 8 }}>
          {error}
        </div>
      )}
    </div>
  );
}
