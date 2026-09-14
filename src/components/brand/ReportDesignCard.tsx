/*
 * ReportDesignCard.tsx — the "Report design" card on the Brand Identity tab of
 * Company Profile. Three decisions (cover layout, brand colours, typography)
 * and one live A4 preview of the result.
 *
 * Lifted out of BrandIdentityPage so the card owns its own derived state (the
 * active layout key, what "recommended" means for it, the measured preview
 * width) instead of the page carrying four card-only values. The page still
 * owns the saved `design` object and the dirty check, and passes it down.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import BrandColorPicker from '@/components/brand/BrandColorPicker';
import { MiniCover } from '@/components/quarterly/CoverTemplatePicker';
import { ReportPreview } from '@/components/quarterly/ReportPreview';
import { TypographyControls } from '@/components/quarterly/TypographyControls';
import type { BrandColors, ColorPalette } from '@/types/brand';
import type { CoverTemplate, Typography } from '@/types/quarterly';
import { DEFAULT_LAYOUT_KEY, LAYOUT_TYPOGRAPHY_DEFAULTS } from '@/types/quarterly';

// The company's default report look. Both halves nullable: null means "we have
// no company default", which is exactly what a fresh company has and what makes
// a report fall through to the picked layout's own blueprint. Structurally the
// same as CompanyReportDesign in types/company, but with both keys REQUIRED —
// the page diffs this object against its saved baseline, and an absent key and
// a null key would compare as different.
export type ReportDesign = {
  cover_template_key: string | null;
  typography: Typography | null;
};

// Seed for the first paint only; the observer corrects it as soon as the pane
// has a box. Set to the .rd-sheet cap so the very first frame is the common
// case rather than a mock that visibly jumps wider.
const PREVIEW_PANE_W = 500;

// Which of the three wireframes a catalogue key maps to. Mirrors
// CoverTemplatePicker.collapseVariant — unknown keys read as classic, which is
// also what the backend's _cover_variant does with an unrecognised background.
function collapseTemplate(key: string): 'classic' | 'bold' | 'minimal' {
  const k = (key || '').toLowerCase();
  if (k.includes('bold')) return 'bold';
  if (k.includes('minimal') || k.includes('clean')) return 'minimal';
  return 'classic';
}

function templateName(list: CoverTemplate[], key: string): string {
  return list.find((t) => t.key === key)?.name || key || 'Classic';
}

export function ReportDesignCard({
  templates,
  palettes,
  colors,
  design,
  logoUrl,
  canEdit,
  onColorsChange,
  onDesignChange,
}: {
  templates: CoverTemplate[];
  palettes: ColorPalette[];
  colors: BrandColors;
  design: ReportDesign;
  logoUrl: string | null;
  canEdit: boolean;
  onColorsChange: (next: BrandColors) => void;
  onDesignChange: (next: ReportDesign) => void;
}) {
  // Measured, not constant: the preview column is a fixed track only above the
  // breakpoint. Below it the column is fluid, and a hardcoded width would leave
  // the A4 mock floating in a too-wide slot. Mirrors CoverTemplatePicker's own
  // observer so the modal and this card behave identically.
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [paneWidth, setPaneWidth] = useState(PREVIEW_PANE_W);
  const [view, setView] = useState<'cover' | 'page'>('cover');

  useLayoutEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const measure = () => setPaneWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The layout the card is showing: the company's pick, else the catalogue's
  // default, else classic — the same ladder the report modal walks.
  const activeTemplateKey =
    design.cover_template_key
    || templates.find((t) => t.is_default)?.key
    || templates[0]?.key
    || DEFAULT_LAYOUT_KEY;

  // What "recommended" means for that layout. Prefer the server blueprint so the
  // hint tracks the catalogue; fall back to the frontend constant, which the
  // migration's values match exactly.
  const layoutDefaults: Typography =
    ((templates.find((t) => t.key === activeTemplateKey)?.layout as
      { typography?: Typography } | undefined)?.typography)
    || LAYOUT_TYPOGRAPHY_DEFAULTS[collapseTemplate(activeTemplateKey)]
    || LAYOUT_TYPOGRAPHY_DEFAULTS[DEFAULT_LAYOUT_KEY];

  // No saved typography means "use the layout's own" — show that rather than a
  // blank, so the controls always reflect what a report would actually render.
  const activeTypography: Typography = design.typography ?? layoutDefaults;

  // Switching layout while the fonts are untouched carries the new layout's
  // recommendation across; a deliberate choice is left alone.
  const pickTemplate = (key: string) => {
    onDesignChange({ cover_template_key: key, typography: design.typography });
  };

  return (
    // No maxWidth: this card sits under two full-width siblings, and capping
    // only this one left a band of page down its right. What the cap was really
    // patching — a font <select> stretching across the whole card — is bounded
    // on .rd-controls instead, where it belongs.
    <div className="card" style={{ marginTop: 16 }}>
      <div className="ch">
        <div>
          <div className="ct">Report design</div>
          <div style={{ fontSize: 10, color: '#9BA3C4', marginTop: 2 }}>
            How your reports look — cover, colors and type
          </div>
        </div>
        <span aria-hidden style={{ display: 'inline-flex', borderRadius: 999, overflow: 'hidden', border: '1px solid rgba(0,0,0,.1)' }}>
          <span style={{ width: 22, height: 14, background: colors.primary }} />
          <span style={{ width: 22, height: 14, background: colors.secondary }} />
        </span>
      </div>
      <div className="cb">
        {/* The hint rides inside .rd-body rather than above it so it stays
            flush with the settings column once the body starts centring. */}
        <div className="rd-body">
          <p className="ob-brand-hint" style={{ marginTop: 0, marginBottom: 16 }}>
            Every new report starts from these. You can still override them on any
            individual report.
          </p>

          <div className="rd-grid">

            {/* ── Controls ─────────────────────────────────────── */}
            <fieldset className="rd-controls" disabled={!canEdit}>

              {templates.length > 0 && (
                <>
                  <div className="ob-brand-label">Cover design</div>
                  {/* Three across, with a ceiling. MiniCover's insides are fixed
                      px — 10px padding, 2-7px bars, a 32px accent mark — so it only
                      reads as a cover around 130-180px wide; unbounded it rendered
                      209px here and would reach 404px on a wide monitor, a
                      thumbnail taller than the real page beside it. auto-fit is
                      wrong for the lower bound too: at a 560px column it dropped to
                      two per row and left Minimal alone on a second line. */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 196px))',
                    gap: 10, marginBottom: 22,
                  }}>
                    {templates.filter((t) => t.key !== 'branded').map((t, i) => {
                      const active = t.key === activeTemplateKey;
                      return (
                        <button
                          key={t.key}
                          type="button"
                          aria-pressed={active}
                          onClick={() => pickTemplate(t.key)}
                          className="rd-tile"
                          style={{
                            textAlign: 'left', padding: 8, borderRadius: 10, cursor: 'pointer',
                            background: active ? '#EEEEFF' : '#fff',
                            border: `1.5px solid ${active ? '#4040C8' : '#E2E4F0'}`,
                          }}
                        >
                          <div style={{ position: 'relative', marginBottom: 8 }}>
                            <MiniCover templateKey={t.key} accent={colors.primary} index={i} />
                            {active && (
                              <span aria-hidden style={{
                                position: 'absolute', top: 6, right: 6, width: 16, height: 16,
                                borderRadius: 999, background: '#4040C8',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                                  <path d="M2.5 6.2L5 8.7l4.5-5" stroke="#fff" strokeWidth="1.7"
                                        strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: active ? '#2B2B8F' : '#1A1D2E' }}>
                            {t.name}
                          </div>
                          {t.description && (
                            <div style={{ fontSize: 10.5, color: '#6B7280', marginTop: 2, lineHeight: 1.45 }}>
                              {t.description}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              <div className="ob-brand-label">Brand colors</div>
              <div style={{ marginBottom: 22 }}>
                <BrandColorPicker
                  palettes={palettes}
                  value={colors}
                  showPreview={false}
                  onChange={onColorsChange}
                />
              </div>

                {/* Still a scroll guard, but it only fires on a genuinely narrow
                  window now: the two-pane breakpoint waits until the settings
                  column can hold its full 620, and a typography row needs 537. */}
              <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: 540 }}>
                  <TypographyControls
                    value={activeTypography}
                    onChange={(next) => onDesignChange({ ...design, typography: next })}
                    layoutName={templateName(templates, activeTemplateKey)}
                    layoutDefaults={layoutDefaults}
                  />
                </div>
              </div>
            </fieldset>

            {/* ── Preview ──────────────────────────────────────────
                The pane takes whatever the settings column does not, and the
                page is centred on it. That is what turns the old dead band into
                backdrop: the panel reaches the card's edge at any width, and the
                sheet inside stays the size at which it is actually readable. */}
            <div className="rd-preview">
              <div className="rd-stage">
                {/* The pane's own header. Hoisting the Cover/Page switch out of
                    ReportPreview does two things: it spans the pane so the sheet
                    below reads as sitting ON something rather than floating, and
                    it puts the switch on the app's .tabs kit instead of the
                    modal's Tailwind indigo, which is a different blue from
                    #4040C8 and shows next to the sibling cards. */}
                <div className="rd-stage-bar">
                  <div className="tabs" style={{ marginBottom: 0 }}>
                    {(['cover', 'page'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`tab ${view === m ? 'act' : ''}`}
                        aria-pressed={view === m}
                        onClick={() => setView(m)}
                      >
                        {m === 'cover' ? 'Cover' : 'Page'}
                      </button>
                    ))}
                  </div>
                  <span className="rd-stage-note">
                    Sample content — your own figures aren&apos;t used here.
                  </span>
                </div>
                <div ref={previewRef} className="rd-sheet">
                  <ReportPreview
                    variant={collapseTemplate(activeTemplateKey)}
                    brand={colors}
                    typography={activeTypography}
                    logoUrl={logoUrl}
                    paneWidth={paneWidth}
                    view={view}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
