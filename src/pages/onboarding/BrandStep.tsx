import { useEffect, useState } from 'react';
import BrandColorPicker from '@/components/brand/BrandColorPicker';
import BrandUploadBox from '@/components/brand/BrandUploadBox';
import { LogoColorNote, useLogoBrandColors } from '@/components/brand/LogoBrandColors';
import { ApiError, auth, quarterlyReports } from '@/lib/api';
import type {
  BrandColors,
  ColorPalette,
  ExtractedGuideline,
  PickedLogo,
} from '@/types/brand';
import {
  DOC_ACCEPT,
  DOC_EXTS,
  FALLBACK_COLOR_PALETTES,
  LOGO_ACCEPT,
  formatBytes,
  hasExt,
  readLogoFile,
  validateLogoFile,
} from '@/types/brand';

// Step 3 — the company's branding: a logo, a brand language guideline document,
// and the brand colors that become the default for every report this company
// generates (see _resolve_brand in Centriton/routes/report_routes.py).
//
// Neither upload is required. The logo is read to a base64 data URI in the
// browser and stored inline on the companies row; the guideline document is sent
// to the backend, which returns its extracted text for companies.brand_identity.
// Nothing is persisted until onboarding is submitted.
//
// The same three fields are editable after onboarding on the Brand Identity page
// (pages/BrandIdentityPage.tsx), which is why the limits, the file readers and
// the upload control itself live in types/brand.ts and components/brand/ rather
// than here.

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
  const logoColors = useLogoBrandColors(onBrandColorsChange);

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
    if (!f) {
      onLogoChange(null);
      logoColors.forget();   // the note would be stale, and any detection moot
      return;
    }
    const invalid = validateLogoFile(f);
    if (invalid) { setLogoError(invalid); return; }
    readLogoFile(f)
      .then((picked) => {
        onLogoChange(picked);
        // Fill the colors from the logo. Fire-and-forget — the step is usable
        // the instant the preview appears, whatever this does.
        logoColors.detectFrom(picked.dataUri, brandColors);
      })
      .catch((err: Error) => setLogoError(err.message));
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
        // ApiError.message already carries the backend's `detail` (or a
        // generic message for 429/5xx infra failures) — read it rather than
        // re-parsing `err.body.detail` directly, which would bypass that
        // sanitization. A rejected file must leave any already-accepted
        // document alone.
        setDocError(
          err instanceof ApiError && err.message
            ? err.message
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
        <BrandUploadBox
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
        <LogoColorNote
          detecting={logoColors.detecting}
          applied={logoColors.applied}
          onUndo={logoColors.undo}
        />
      </div>

      {/* ── Brand language guideline ───────────────────────────── */}
      <div className="ob-brand-section">
        <FieldHead title="Brand language guideline" optional />
        <p className="ob-brand-hint">
          Upload your brand or tone-of-voice document — we’ll use it to shape how everything
          we write for you reads.
        </p>
        <BrandUploadBox
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
        {/* forget() first: a colour the user picked by hand must not be
            relabelled as "set from your logo", nor overwritten by a detection
            that is still in flight. */}
        <BrandColorPicker
          palettes={palettes}
          value={brandColors}
          onChange={(next) => { logoColors.forget(); onBrandColorsChange(next); }}
        />
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
