import { useEffect, useState } from 'react';
import BrandColorPicker from '@/components/brand/BrandColorPicker';
import BrandUploadBox from '@/components/brand/BrandUploadBox';
import { LogoColorNote, useLogoBrandColors } from '@/components/brand/LogoBrandColors';
import { Spinner } from '@/components/shared/Spinner';
import { ApiError, auth, companies, quarterlyReports } from '@/lib/api';
import type { BrandColors, ColorPalette } from '@/types/brand';
import {
  DOC_ACCEPT,
  DOC_EXTS,
  FALLBACK_COLOR_PALETTES,
  LOGO_ACCEPT,
  MAX_BRAND_IDENTITY,
  dataUriBytes,
  formatBytes,
  hasExt,
  readLogoFile,
  validateLogoFile,
} from '@/types/brand';
import type { CompanyBrandUpdate } from '@/types/company';

// The three brand values from onboarding step 3, editable after the fact —
// admin-only, matching PATCH /companies/me. Structurally a sibling of
// components/profile/CompanyDetailsCard.tsx: load once, diff against the loaded
// baseline, PATCH only what changed, report inline.
//
// The whole backend for this already existed:
//   GET  /companies/me       → brand_identity + brand_colors (logo stripped)
//   GET  /companies/me/logo  → logo_base64, on its own endpoint (~1.4 MB)
//   PATCH /companies/me      → all three, validated; null clears a column
//   POST /auth/onboarding/extract-brand-language → {text, chars}, stateless

// What's stored is bytes alone — no filename, no size — so a logo loaded back
// from the server has no name to show. Picking a new one gives us both again.
type LogoState = { dataUri: string; name: string | null; size: number } | null;

// The saved server state, for the dirty check. brand_colors is compared as the
// whole object because that's how it's stored and how it's written.
type Baseline = {
  identity: string;
  colors: BrandColors;
  logoDataUri: string | null;
};

const FALLBACK_BRAND: BrandColors = {
  primary: FALLBACK_COLOR_PALETTES[0].primary,
  secondary: FALLBACK_COLOR_PALETTES[0].secondary,
  palette_key: FALLBACK_COLOR_PALETTES[0].key,
};

export default function BrandIdentityPage() {
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [identity, setIdentity] = useState('');
  const [colors, setColors] = useState<BrandColors>(FALLBACK_BRAND);
  const [logo, setLogo] = useState<LogoState>(null);

  const [palettes, setPalettes] = useState<ColorPalette[]>(FALLBACK_COLOR_PALETTES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [logoError, setLogoError] = useState('');
  const [docError, setDocError] = useState('');
  const [reading, setReading] = useState(false);
  const logoColors = useLogoBrandColors(setColors);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([companies.getMyCompany(), companies.getMyCompanyLogo()])
      .then(([company, logoRes]) => {
        if (cancelled) return;
        const savedIdentity = company.brand_identity ?? '';
        // Hydrated the same way onboarding does, so a company that picked a
        // custom hex sees "Custom" selected rather than a stray preset.
        const savedColors: BrandColors =
          company.brand_colors?.primary && company.brand_colors?.secondary
            ? {
                primary: company.brand_colors.primary,
                secondary: company.brand_colors.secondary,
                palette_key: company.brand_colors.palette_key || 'custom',
              }
            : FALLBACK_BRAND;
        const savedLogo = logoRes.logo_base64 ?? null;

        setIdentity(savedIdentity);
        setColors(savedColors);
        setLogo(savedLogo ? { dataUri: savedLogo, name: null, size: dataUriBytes(savedLogo) } : null);
        setBaseline({ identity: savedIdentity, colors: savedColors, logoDataUri: savedLogo });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load brand identity');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Same presets the onboarding step and the report cover picker offer. Never
  // block the page on this call — FALLBACK_COLOR_PALETTES is already seeded.
  useEffect(() => {
    let cancelled = false;
    quarterlyReports
      .getColorPalettesGlobal()
      .then((res) => {
        if (!cancelled && res.color_palettes?.length) setPalettes(res.color_palettes);
      })
      .catch(() => { /* keep FALLBACK_COLOR_PALETTES */ });
    return () => { cancelled = true; };
  }, []);

  const acceptLogo = (f: File | null) => {
    setLogoError('');
    if (!f) {
      setLogo(null);
      logoColors.forget();   // the note would be stale, and any detection moot
      return;
    }
    const invalid = validateLogoFile(f);
    if (invalid) { setLogoError(invalid); return; }
    readLogoFile(f)
      .then((picked) => {
        setLogo({ dataUri: picked.dataUri, name: picked.name, size: picked.size });
        // Fill the colors from the new logo. Nothing persists until Save, so an
        // unwanted result costs the user one Undo click.
        logoColors.detectFrom(picked.dataUri, colors);
      })
      .catch((err: Error) => setLogoError(err.message));
  };

  // A re-upload lands in the textarea UNSAVED, so it's reviewable and walking
  // away costs nothing. extract-brand-language persists nothing itself.
  const acceptDoc = (f: File | null) => {
    setDocError('');
    if (!f) return;
    if (!hasExt(f.name, DOC_EXTS)) {
      setDocError('That file type isn’t supported. Use a PDF or DOCX.');
      return;
    }
    setReading(true);
    auth
      .extractBrandLanguage(f)
      .then((res) => setIdentity(res.text))
      .catch((err) => {
        // ApiError.message already carries the backend's `detail` (or a
        // generic message for 429/5xx infra failures) — read it rather than
        // re-parsing `err.body.detail` directly, which would bypass that
        // sanitization.
        setDocError(
          err instanceof ApiError && err.message
            ? err.message
            : 'We couldn’t read that document. Try another file.',
        );
      })
      .finally(() => setReading(false));
  };

  const trimmedIdentity = identity.trim();
  const overCap = trimmedIdentity.length > MAX_BRAND_IDENTITY;
  const isDirty =
    baseline !== null &&
    (trimmedIdentity !== baseline.identity ||
      JSON.stringify(colors) !== JSON.stringify(baseline.colors) ||
      (logo?.dataUri ?? null) !== baseline.logoDataUri);

  const handleSave = async () => {
    if (!baseline) return;
    const payload: CompanyBrandUpdate = {};
    if (trimmedIdentity !== baseline.identity) {
      // null clears the column; '' would store an empty string that reads as set.
      payload.brand_identity = trimmedIdentity || null;
    }
    if (JSON.stringify(colors) !== JSON.stringify(baseline.colors)) {
      // Always the COMPLETE object: PATCH overwrites the whole brand_colors
      // jsonb with no server-side merge, and the backend discards the entire
      // company value if primary is missing.
      payload.brand_colors = { ...colors };
    }
    const nextLogo = logo?.dataUri ?? null;
    if (nextLogo !== baseline.logoDataUri) payload.logo_base64 = nextLogo;

    if (Object.keys(payload).length === 0) {
      setSuccess('No changes to save');
      setTimeout(() => setSuccess(null), 2000);
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await companies.updateMyCompany(payload);
      // Re-baseline from the local values, not the response: PATCH returns the
      // full row including logo_base64, which GET deliberately strips.
      setBaseline({ identity: trimmedIdentity, colors: { ...colors }, logoDataUri: nextLogo });
      setIdentity(trimmedIdentity);
      setSuccess('Brand identity updated successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update brand identity');
    } finally {
      setSaving(false);
    }
  };

  return (
    // Bottom padding clears the fixed "Ask Centriyon" chatbot button so the
    // Save bar doesn't sit under it — same as ProfilePage.
    <div style={{ paddingBottom: 96 }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>Brand Identity</h2>
        <p style={{ fontSize: 11, color: '#5A6080', marginTop: 2 }}>
          Your logo, brand language and colors — used across the reports you generate
        </p>
      </div>

      {loading ? (
        <div className="card"><div className="cb"><Spinner pad={32} /></div></div>
      ) : error && !baseline ? (
        <Banner tone="error">{error}</Banner>
      ) : (
        <>
          {/* ── Logo ─────────────────────────────────────────────── */}
          <div className="card">
            <div className="ch">
              <div>
                <div className="ct">Company logo</div>
                <div style={{ fontSize: 10, color: '#9BA3C4', marginTop: 2 }}>
                  Appears on the cover page of your generated reports
                </div>
              </div>
            </div>
            <div className="cb">
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
                        <img src={logo.dataUri} alt={logo.name ? `${logo.name} preview` : 'Company logo'} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="ob-logo-name">{logo.name ?? 'Current logo'}</div>
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
          </div>

          {/* ── Brand language ───────────────────────────────────── */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="ch">
              <div>
                <div className="ct">Brand language guideline</div>
                <div style={{ fontSize: 10, color: '#9BA3C4', marginTop: 2 }}>
                  The text we hold from your brand or tone-of-voice document
                </div>
              </div>
            </div>
            <div className="cb">
              <BrandUploadBox
                icon="📄"
                prompt="Drag a new guideline here"
                hint="PDF or DOCX · replaces the text below"
                accept={DOC_ACCEPT}
                error={docError}
                busy={reading}
                busyLabel="Reading your document…"
                onPick={acceptDoc}
                removeLabel="Remove document"
              />

              <div className="fl" style={{ marginTop: 14 }}>
                {/* .fl-label is display:block, so the flex row is what lets
                    .ob-char-count's margin-left:auto push the count right. */}
                <label
                  className="fl-label"
                  htmlFor="brand-identity-text"
                  style={{ display: 'flex', alignItems: 'center' }}
                >
                  Brand language
                  <span className={`ob-char-count${overCap ? ' over' : ''}`}>
                    {trimmedIdentity.length.toLocaleString()} / {MAX_BRAND_IDENTITY.toLocaleString()}
                  </span>
                </label>
                <textarea
                  id="brand-identity-text"
                  className="inp"
                  value={identity}
                  onChange={(e) => setIdentity(e.target.value)}
                  rows={10}
                  placeholder="Upload a document above, or write your brand language here."
                  style={{ resize: 'vertical', lineHeight: 1.6 }}
                />
                {overCap && (
                  <div className="fl-err">
                    That’s {(trimmedIdentity.length - MAX_BRAND_IDENTITY).toLocaleString()} characters
                    over the limit — trim it before saving.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Colors ───────────────────────────────────────────── */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="ch">
              <div>
                <div className="ct">Brand colors</div>
                <div style={{ fontSize: 10, color: '#9BA3C4', marginTop: 2 }}>
                  Default colors for report headings and cover pages
                </div>
              </div>
              <span aria-hidden style={{ display: 'inline-flex', borderRadius: 999, overflow: 'hidden', border: '1px solid rgba(0,0,0,.1)' }}>
                <span style={{ width: 22, height: 14, background: colors.primary }} />
                <span style={{ width: 22, height: 14, background: colors.secondary }} />
              </span>
            </div>
            <div className="cb">
              <p className="ob-brand-hint" style={{ marginTop: 0 }}>
                You can still override these on any individual report.
              </p>
              {/* forget() first: a colour the user picked by hand must not be
                  relabelled as "set from your logo", nor overwritten by a
                  detection that is still in flight. */}
              <BrandColorPicker
                palettes={palettes}
                value={colors}
                onChange={(next) => { logoColors.forget(); setColors(next); }}
              />
            </div>
          </div>

          {error && <Banner tone="error" spaced>{error}</Banner>}
          {success && <Banner tone="success" spaced>{success}</Banner>}

          <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              className="btn bp"
              type="button"
              onClick={handleSave}
              disabled={saving || !isDirty || overCap}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Banner({
  tone, children, spaced,
}: { tone: 'error' | 'success'; children: React.ReactNode; spaced?: boolean }) {
  const isError = tone === 'error';
  return (
    <div
      role={isError ? 'alert' : 'status'}
      style={{
        marginTop: spaced ? 16 : 0,
        background: isError ? 'rgba(239,68,68,.04)' : 'rgba(34,197,94,.08)',
        border: `1px solid ${isError ? 'rgba(239,68,68,.25)' : 'rgba(34,197,94,.25)'}`,
        borderRadius: 10,
        padding: '10px 14px',
        color: isError ? '#DC2626' : '#16A34A',
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}
