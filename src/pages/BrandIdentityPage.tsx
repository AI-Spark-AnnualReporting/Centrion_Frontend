import { useEffect, useState } from 'react';
import BrandUploadBox from '@/components/brand/BrandUploadBox';
import BrandVoiceCard from '@/components/brand/BrandVoiceCard';
import { LogoColorNote, useLogoBrandColors } from '@/components/brand/LogoBrandColors';
import { ReportDesignCard } from '@/components/brand/ReportDesignCard';
import type { ReportDesign } from '@/components/brand/ReportDesignCard';
import { Spinner } from '@/components/shared/Spinner';
import { useAuth } from '@/context/AuthContext';
import { ApiError, auth, companies, quarterlyReports } from '@/lib/api';
import type { BrandColors, ColorPalette } from '@/types/brand';
import type { CoverTemplate } from '@/types/quarterly';
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
import type { BrandVoice, CompanyBrandUpdate } from '@/types/company';

// The three brand values from onboarding step 3, editable after the fact —
// visible to anyone with profile access (rendered as a section of the Company
// Profile page), editable by admin only, matching PATCH /companies/me.
// Structurally a sibling of components/profile/CompanyDetailsCard.tsx: load
// once, diff against the loaded baseline, PATCH only what changed, report
// inline. Non-admin viewers get every control wrapped in a disabled
// <fieldset> — same read-only pattern CompanyDetailsCard uses.
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
  design: ReportDesign;
  voice: BrandVoice | null;
};

const EMPTY_DESIGN: ReportDesign = { cover_template_key: null, typography: null };

const FALLBACK_BRAND: BrandColors = {
  primary: FALLBACK_COLOR_PALETTES[0].primary,
  secondary: FALLBACK_COLOR_PALETTES[0].secondary,
  palette_key: FALLBACK_COLOR_PALETTES[0].key,
};

// hideHeading — when rendered as a tab of Company Profile, that page's own
// header already says "Brand Identity"; repeating it here would be redundant.
export default function BrandIdentityPage({ hideHeading }: { hideHeading?: boolean } = {}) {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin';
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [identity, setIdentity] = useState('');
  const [colors, setColors] = useState<BrandColors>(FALLBACK_BRAND);
  const [logo, setLogo] = useState<LogoState>(null);
  const [design, setDesign] = useState<ReportDesign>(EMPTY_DESIGN);
  const [voice, setVoice] = useState<BrandVoice | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);

  const [palettes, setPalettes] = useState<ColorPalette[]>(FALLBACK_COLOR_PALETTES);
  const [templates, setTemplates] = useState<CoverTemplate[]>([]);
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
        // Unlike colours, an unset design is left EMPTY rather than seeded with a
        // fallback: a seeded value would make the page mount dirty, and "no
        // company default" is a real, meaningful state here.
        const savedDesign: ReportDesign = {
          cover_template_key: company.report_design?.cover_template_key ?? null,
          typography: company.report_design?.typography ?? null,
        };

        const savedVoice = company.brand_voice ?? null;

        setIdentity(savedIdentity);
        setColors(savedColors);
        setDesign(savedDesign);
        setVoice(savedVoice);
        setVoiceStatus(company.brand_voice_status ?? null);
        setLogo(savedLogo ? { dataUri: savedLogo, name: null, size: dataUriBytes(savedLogo) } : null);
        setBaseline({ identity: savedIdentity, colors: savedColors, logoDataUri: savedLogo, design: savedDesign, voice: savedVoice });
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

  // The same catalogue the report design modal reads. Non-blocking like the
  // palettes above: if it fails the card simply offers no layouts rather than
  // taking the whole page down with it.
  useEffect(() => {
    let cancelled = false;
    quarterlyReports
      .getCoverTemplatesGlobal()
      .then((res) => {
        if (!cancelled && res.cover_templates?.length) setTemplates(res.cover_templates);
      })
      .catch(() => { /* card renders without layouts */ });
    return () => { cancelled = true; };
  }, []);

  // Extraction runs in the background after a guideline is saved, so the rules
  // land a few seconds after the PATCH returns. Poll only while it is actually
  // running, and stop on the first non-processing answer.
  useEffect(() => {
    if (voiceStatus !== 'processing') return;
    let cancelled = false;
    const id = setInterval(() => {
      companies
        .getMyCompany()
        .then((company) => {
          if (cancelled) return;
          const status = company.brand_voice_status ?? null;
          if (status === 'processing') return;
          const next = company.brand_voice ?? null;
          setVoiceStatus(status);
          setVoice(next);
          // Re-baseline too: this value came FROM the server, so it must not
          // count as an unsaved local edit and light up the Save bar.
          setBaseline((b) => (b ? { ...b, voice: next } : b));
        })
        .catch(() => { /* keep polling; a blip shouldn't strand the card */ });
    }, 2500);
    return () => { cancelled = true; clearInterval(id); };
  }, [voiceStatus]);

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
      JSON.stringify(design) !== JSON.stringify(baseline.design) ||
      JSON.stringify(voice) !== JSON.stringify(baseline.voice) ||
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
    if (JSON.stringify(design) !== JSON.stringify(baseline.design)) {
      // Whole object, same reason as brand_colors: the PATCH overwrites the
      // report_design jsonb without merging.
      payload.report_design = { ...design };
    }
    // Sent only when the user actually edited the rules. That distinction is
    // load-bearing on the server: a brand_voice in the same PATCH marks the voice
    // as hand-corrected and SKIPS the re-extraction a new guideline would trigger,
    // so sending it unchanged alongside a new document would suppress the very
    // extraction the document was uploaded for.
    if (JSON.stringify(voice) !== JSON.stringify(baseline.voice)) {
      payload.brand_voice = voice;
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
      setBaseline({ identity: trimmedIdentity, colors: { ...colors }, logoDataUri: nextLogo, design: { ...design }, voice });
      setIdentity(trimmedIdentity);
      // A new guideline kicks off background extraction; show the reading state
      // immediately so the card below doesn't sit on the previous voice as if
      // nothing were happening. The poll effect takes it from here.
      if (payload.brand_identity !== undefined && payload.brand_voice === undefined) {
        setVoiceStatus('processing');
      }
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
    // Save bar doesn't sit under it — same as ProfilePage. Skipped when
    // embedded as a Company Profile tab, which already provides it.
    <div style={hideHeading ? undefined : { paddingBottom: 96 }}>
      {!hideHeading && (
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>Brand Identity</h2>
        <p style={{ fontSize: 11, color: '#5A6080', marginTop: 2 }}>
          Your logo, brand language and colors — used across the reports you generate
        </p>
      </div>
      )}

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
              <fieldset disabled={!canEdit} style={{ border: 0, margin: 0, padding: 0 }}>
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
              </fieldset>
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
              <fieldset disabled={!canEdit} style={{ border: 0, margin: 0, padding: 0 }}>
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
              </fieldset>
            </div>
          </div>

          <BrandVoiceCard
            voice={voice}
            status={voiceStatus}
            hasGuideline={trimmedIdentity.length > 0}
            canEdit={canEdit}
            onChange={setVoice}
          />

          {/* ── Report design ─────────────────────────────────────
              Two panes — the settings, and one live page of the result. The
              card itself is deliberately uncapped: it sits under two
              full-width siblings, and capping only this one is what left a
              band of empty page down its right. The measures that the old cap
              was really protecting now sit on the controls inside it. */}
          <ReportDesignCard
            templates={templates}
            palettes={palettes}
            colors={colors}
            design={design}
            logoUrl={logo?.dataUri ?? null}
            canEdit={canEdit}
            // forget() first — a colour picked by hand must not be relabelled
            // as "set from your logo", nor overwritten by a detection still in
            // flight.
            onColorsChange={(next) => { logoColors.forget(); setColors(next); }}
            onDesignChange={setDesign}
          />

          {error && <Banner tone="error" spaced>{error}</Banner>}
          {success && <Banner tone="success" spaced>{success}</Banner>}

          {canEdit && (
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
          )}
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
