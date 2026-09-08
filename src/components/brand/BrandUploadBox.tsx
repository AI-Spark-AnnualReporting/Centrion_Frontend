import { useRef, useState } from 'react';

// One compact upload control for both brand fields: dashed drop target until
// something is picked, then a filled row of the same height (so the field never
// jumps). Moved here verbatim from pages/onboarding/BrandStep.tsx once the Brand
// Identity page needed the same two fields outside the wizard — same markup and
// the same .ob-* classes, so the onboarding tests still cover it.
//
// The full-size .ob-drop is left alone; CompanyIntelStep still uses it.
//
// `stacked` turns the same control vertical. The default row wants about 300px
// — icon, prompt, hint and the Browse button side by side — and BR32's
// per-director photo cell has 168, because widening it pushes that person's job
// fields onto a second line. Everything else is identical, so there is still
// one image picker in the product.
export default function BrandUploadBox({
  icon, prompt, hint, accept, error, busy, busyLabel, filled, removeLabel, onPick, stacked,
}: {
  icon: string;
  prompt: string;
  hint: string;
  accept: string;
  error?: string;
  busy?: boolean;
  busyLabel?: string;
  filled?: React.ReactNode;
  removeLabel: string;
  onPick: (f: File | null) => void;
  stacked?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // One file only, for both fields this box serves: a logo is a single image,
  // and the brand guideline is read by one extraction call. A multi-file drop is
  // rejected rather than silently reduced to the first — we can't know which one
  // was meant. (The file input is already single-select, and the drop target
  // only renders while the field is empty, so nothing staged is lost here.)
  const pickDropped = (list: FileList | null) => {
    if (list && list.length > 1) {
      setDropError('One file at a time — please drop a single file.');
      return;
    }
    setDropError(null);
    onPick(list?.[0] ?? null);
  };

  return (
    <>
      {filled ? (
        <div className={`ob-logo-preview${stacked ? ' ob-logo-preview-stacked' : ''}`}>
          {filled}
          <button type="button" className="ob-upload-btn" onClick={() => inputRef.current?.click()}>
            Replace
          </button>
          <button
            type="button"
            className="ob-logo-remove"
            onClick={() => onPick(null)}
            aria-label={removeLabel}
            title={removeLabel}
          >
            ✕
          </button>
        </div>
      ) : (
        <div
          className={`ob-drop ${stacked ? 'ob-drop-stacked' : 'ob-drop-compact'}${dragOver ? ' over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            pickDropped(e.dataTransfer.files);
          }}
        >
          <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }} aria-hidden>{icon}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="ob-drop-prompt">{busy ? busyLabel : prompt}</div>
            <div className="ob-drop-hint">
              {busy ? (
                <span className="proc-ring" style={{ width: 12, height: 12, borderWidth: 2, display: 'inline-block', verticalAlign: 'middle' }} />
              ) : hint}
            </div>
          </div>
          <button
            type="button"
            className="ob-browse ob-browse-inline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            Browse file
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => {
          setDropError(null);
          onPick(e.target.files?.[0] ?? null);
          e.target.value = ''; // re-picking the same file must still fire onChange
        }}
      />
      {(error || dropError) && <div className="fl-err">{error || dropError}</div>}
    </>
  );
}
