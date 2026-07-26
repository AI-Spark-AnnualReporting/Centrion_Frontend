import { useRef, useState } from 'react';
import { INK, DANGER, BORDER } from './tokens';

// Shown in place of a needs_input section's body: a textarea the user can
// type directly into, or prefill by uploading a document (extracted text
// lands in the textarea for review/edit — nothing is saved until Save).
export function SectionInputForm({
  message,
  onSave,
  onExtract,
}: {
  message: string;
  onSave: (text: string) => Promise<void>;
  onExtract: (file: File) => Promise<string>;
}) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setExtracting(true);
    setError(null);
    try {
      const extracted = await onExtract(file);
      setText(extracted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not extract text from that file.');
    } finally {
      setExtracting(false);
    }
  };

  const handleSave = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || extracting;

  return (
    <div>
      <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#B4730B', fontWeight: 600 }}>{message}</p>
      <textarea
        value={text}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type the missing information, or upload a document below to extract it automatically…"
        style={{
          width: '100%',
          minHeight: 100,
          padding: '12px 14px',
          borderRadius: 8,
          border: `1px solid ${error ? '#FECACA' : BORDER}`,
          fontSize: 13.5,
          lineHeight: 1.6,
          color: INK,
          outline: 'none',
          resize: 'vertical',
          fontFamily: 'inherit',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn bp bsm"
          onClick={() => void handleSave()}
          disabled={busy || !text.trim()}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.xlsx,.csv,.txt"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void handleFile(file);
          }}
        />
        <button
          type="button"
          className="btn bs bsm"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
        >
          {extracting ? 'Extracting…' : 'Upload a document to extract from'}
        </button>
        {error && <span style={{ fontSize: 11.5, color: DANGER }}>{error}</span>}
      </div>
    </div>
  );
}
