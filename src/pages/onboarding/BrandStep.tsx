import { useEffect, useRef, useState } from 'react';
import BrandColorPicker from '@/components/brand/BrandColorPicker';
import { auth, quarterlyReports } from '@/lib/api';
import type {
  BrandColors,
  ColorPalette,
  ExtractedGuideline,
  PickedLogo,
} from '@/types/brand';
import { FALLBACK_COLOR_PALETTES } from '@/types/brand';

// Step 3 — the company's branding: a logo, a brand language guideline document,
// and the brand colors that become the default for every report this company
// generates (see _resolve_brand in Centriton/routes/report_routes.py).
//
// Neither upload is required. The logo is read to a base64 data URI in the
// browser and stored inline on the companies row; the guideline document is sent
// to the backend, which returns its extracted text for companies.brand_identity.
// Nothing is persisted until onboarding is submitted.

export const MAX_BRAND_IDENTITY = 24000;

// PNG/JPEG only, capped to match MAX_LOGO_BYTES in Centriton/brand_constants.py.
// The logo is stored inline on the company row as base64, so the cap is about
// row size, not upload bandwidth.
const LOGO_MAX_BYTES = 1024 * 1024;
// Some browsers report a .jpg as image/jpg; the backend normalizes it.
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];
const LOGO_ACCEPT = '.png,.jpg,.jpeg,image/png,image/jpeg';

// Mirrors _PROFILE_ALLOWED_EXTS in Centriton/routes/auth_routes.py.
const DOC_ACCEPT = '.pdf,.docx';
const DOC_EXTS = ['.pdf', '.docx'];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function hasExt(name: string, exts: string[]): boolean {
  return exts.some((e) => name.toLowerCase().endsWith(e));
}

export default function BrandStep({
  logo,
  onLogoChange,
  guideline,
  onGuidelineChange,
  brandColors,
  onBrandColorsChange,
  onBack,
  onContinue,
}: {
  logo: PickedLogo | null;
  onLogoChange: (logo: PickedLogo | null) => void;
  guideline: ExtractedGuideline | null;
  onGuidelineChange: (g: ExtractedGuideline | null) => void;
  brandColors: BrandColors;
  onBrandColorsChange: (v: BrandColors) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [palettes, setPalettes] = useState<ColorPalette[]>(FALLBACK_COLOR_PALETTES);
  const [logoError, setLogoError] = useState('');
  const [docError, setDocError] = useState('');
  const [reading, setReading] = useState(false);

  // Same presets the report builder's cover picker offers, so a company that
  // picks "Navy & Gold" here sees the identical pill there.
  useEffect(() => {
    let cancelled = false;
    quarterlyReports
      .getColorPalettesGlobal()
      .then((res) => {
        if (!cancelled && res.color_palettes?.length) setPalettes(res.color_palettes);
      })
      .catch(() => {
        /* keep FALLBACK_COLOR_PALETTES — never block onboarding on this call */
      });
    return () => { cancelled = true; };
  }, []);

  // Validate, then read to a base64 data URI — the exact shape stored in
  // companies.logo_base64 and rendered straight into the report cover.
  const acceptLogo = (f: File | null) => {
    setLogoError('');
    if (!f) { onLogoChange(null); return; }
    if (!LOGO_TYPES.includes(f.type)) {
      setLogoError('That file type isn’t supported. Use a PNG or JPG.');
      return;
    }
    if (f.size > LOGO_MAX_BYTES) {
      setLogoError(`That image is ${formatBytes(f.size)} — the limit is 1 MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUri.startsWith('data:image/')) {
        setLogoError('We couldn’t read that image. Try another file.');
        return;
      }
      onLogoChange({ name: f.name, size: f.size, dataUri });
    };
    reader.onerror = () => setLogoError('We couldn’t read that image. Try another file.');
    reader.readAsDataURL(f);
  };

  // The backend does the PDF/DOCX text extraction (same extractor the step-1
  // company-profile upload uses) and hands back the text we store.
  const acceptDoc = (f: File | null) => {
    setDocError('');
    if (!f) { onGuidelineChange(null); return; }
    if (!hasExt(f.name, DOC_EXTS)) {
      setDocError('That file type isn’t supported. Use a PDF or DOCX.');
      return;
    }
    setReading(true);
    auth
      .extractBrandLanguage(f)
      .then((res) => onGuidelineChange({ name: f.name, text: res.text, chars: res.chars }))
      .catch((err) => {
        const detail = (err as { body?: { detail?: unknown } })?.body?.detail;
        // A rejected file must leave any already-accepted document alone.
        setDocError(
          typeof detail === 'string'
            ? detail
            : 'We couldn’t read that document. Try another file.',
        );
      })
      .finally(() => setReading(false));
  };

  return (
    <>
      <h2>Your Brand</h2>
      <p>This is how your reports will look and sound. You can change any of it later.</p>

      {/* ── Logo ───────────────────────────────────────────────── */}
      <div className="ob-brand-section">
        <FieldHead title="Company logo" optional />
        <UploadBox
          icon="🖼️"
          prompt="Drag your logo here"
          hint="PNG or JPG · up to 1 MB"
          accept={LOGO_ACCEPT}
          error={logoError}
          onPick={acceptLogo}
          filled={
            logo && (
              <>
                <div className="ob-logo-thumb">
                  <img src={logo.dataUri} alt={`${logo.name} preview`} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="ob-logo-name">{logo.name}</div>
                  <div className="ob-logo-meta">{formatBytes(logo.size)}</div>
                </div>
              </>
            )
          }
          removeLabel="Remove logo"
        />
      </div>

      {/* ── Brand language guideline ───────────────────────────── */}
      <div className="ob-brand-section">
        <FieldHead title="Brand language guideline" optional />
        <p className="ob-brand-hint">
          Upload your brand or tone-of-voice document — we’ll use it to shape how everything
          we write for you reads.
        </p>
        <UploadBox
          icon="📄"
          prompt="Drag your guideline here"
          hint="PDF or DOCX"
          accept={DOC_ACCEPT}
          error={docError}
          busy={reading}
          busyLabel="Reading your document…"
          onPick={acceptDoc}
          filled={
            guideline && (
              <>
                <div className="ob-logo-thumb" aria-hidden style={{ fontSize: 22 }}>📄</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="ob-logo-name">{guideline.name}</div>
                  {/* The character count is the honest signal that the text was
                      actually pulled out, not just that the file was accepted. */}
                  <div className="ob-logo-meta">
                    {guideline.chars.toLocaleString()} characters read
                  </div>
                </div>
              </>
            )
          }
          removeLabel="Remove document"
        />
      </div>

      {/* ── Brand colors ───────────────────────────────────────── */}
      <div className="ob-brand-section">
        <div className="ob-brand-head">
          <span className="ob-brand-title">Brand colors</span>
          <span aria-hidden style={{ display: 'inline-flex', borderRadius: 999, overflow: 'hidden', border: '1px solid rgba(0,0,0,.1)' }}>
            <span style={{ width: 22, height: 14, background: brandColors.primary }} />
            <span style={{ width: 22, height: 14, background: brandColors.secondary }} />
          </span>
        </div>
        <p className="ob-brand-hint">
          These become the default colors for the <strong>headings and cover pages</strong> of
          every report you generate. You can still override them on any individual report.
        </p>
        <BrandColorPicker palettes={palettes} value={brandColors} onChange={onBrandColorsChange} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 18 }}>
        <button type="button" className="btn bs" onClick={onBack}>← Back</button>
        <button type="button" className="btn bp" onClick={onContinue}>Continue →</button>
      </div>
    </>
  );
}

function FieldHead({ title, optional }: { title: string; optional?: boolean }) {
  return (
    <div className="ob-brand-head">
      <span className="ob-brand-title">{title}</span>
      {optional && <span className="ob-brand-optional">Optional</span>}
    </div>
  );
}

// One compact upload control for both fields: dashed drop target until something
// is picked, then a filled row of the same height (so the field never jumps).
function UploadBox({
  icon, prompt, hint, accept, error, busy, busyLabel, filled, removeLabel, onPick,
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
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      {filled ? (
        <div className="ob-logo-preview">
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
          className={`ob-drop ob-drop-compact${dragOver ? ' over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            onPick(e.dataTransfer.files?.[0] ?? null);
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
            Browse files
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => {
          onPick(e.target.files?.[0] ?? null);
          e.target.value = ''; // re-picking the same file must still fire onChange
        }}
      />
      {error && <div className="fl-err">{error}</div>}
    </>
  );
}
