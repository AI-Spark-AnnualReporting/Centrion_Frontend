/*
 * CoverTemplatePicker — the Report Design modal.
 *
 * Two-pane layout: Layout / Brand Colour / Typography on the left, an
 * A4-scaled live preview (Cover | Page toggle) on the right that repaints
 * on every control change. Apply sends {cover_template_key, brand,
 * typography} to the parent, which persists via PATCH .../cover-template
 * on the quarterly / earnings / board endpoints — same modal, four
 * flows, one save shape.
 *
 * Same props as before + `initialTypography` and `logoUrl` (both optional
 * for parents that haven't been updated yet). The Branded template stays
 * hidden — three visible cards.
 *
 * Styling: Tailwind for the new panes (matches the rest of the app);
 * inline styles kept only for dynamic values (brand colour swatches,
 * variant thumbnails). This is a new pattern for THIS file — the previous
 * version was all inline styles.
 */
import { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import type {
  BrandColors,
  ColorPalette,
  CompanyDesignDefault,
  CoverSelectionPayload,
  CoverTemplate,
  Typography,
} from '@/types/quarterly';
import { LAYOUT_TYPOGRAPHY_DEFAULTS, DEFAULT_LAYOUT_KEY } from '@/types/quarterly';
import { TypographyControls, hasCustomTypography } from './TypographyControls';
import { ReportPreview, type PreviewVariant } from './ReportPreview';


// ─── colour helpers (unchanged from the previous modal) ─────────────
function normalizeHex(v: string): string | null {
  let s = v.trim();
  if (!s.startsWith('#')) s = `#${s}`;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    s = '#' + s.slice(1).split('').map((c) => c + c).join('');
  }
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null;
}
function luminance(hex: string): number {
  const h = normalizeHex(hex) ?? '#000000';
  const ch = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.4152 * ch[2];
}
const isLight = (hex: string) => luminance(hex) > 0.7;


// ─── layout key normalisation ───────────────────────────────────────
// Both CoverRenderer.variantFor and this modal collapse arbitrary
// template keys to one of the three visible variants. Kept in sync
// with src/components/quarterly/CoverRenderer.tsx.
const VISIBLE_VARIANTS = ['classic', 'bold', 'minimal'] as const;

function collapseVariant(templateKey: string | null | undefined): PreviewVariant {
  const k = (templateKey || '').toLowerCase();
  if (k.includes('bold')) return 'bold';
  if (k.includes('minimal') || k.includes('clean')) return 'minimal';
  return 'classic';
}


// ─── thumbnail mini-preview (unchanged from previous modal) ─────────
export function MiniCover({ templateKey, accent, index = 0 }: { templateKey: string; accent: string; index?: number }) {
  const variant = collapseVariant(templateKey) || VISIBLE_VARIANTS[index % VISIBLE_VARIANTS.length];
  const shell: React.CSSProperties = {
    width: '100%', aspectRatio: '1 / 1.3', borderRadius: 6, background: '#fff',
    border: '1px solid #E5E7EF', overflow: 'hidden', display: 'flex', flexDirection: 'column',
  };
  const line = (w: string, c = '#E4E6F1') => (
    <div style={{ height: 4, width: w, borderRadius: 3, background: c }} />
  );
  if (variant === 'bold') {
    return (
      <div style={shell}>
        <div style={{ background: accent, padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ height: 6, width: '70%', borderRadius: 3, background: 'rgba(255,255,255,.9)' }} />
          <div style={{ height: 4, width: '45%', borderRadius: 3, background: 'rgba(255,255,255,.6)' }} />
        </div>
        <div style={{ flex: 1, padding: 10, display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'flex-end' }}>
          {line('60%')}{line('40%')}
        </div>
      </div>
    );
  }
  if (variant === 'minimal') {
    return (
      <div style={{ ...shell, padding: 10, justifyContent: 'center', gap: 6 }}>
        <div style={{ height: 3, width: 20, borderRadius: 3, background: accent }} />
        <div style={{ height: 6, width: '65%', borderRadius: 3, background: '#1A1D2E' }} />
        {line('40%')}
      </div>
    );
  }
  return (
    <div style={{ ...shell, padding: 10, gap: 6 }}>
      <div style={{ height: 4, width: 32, borderRadius: 3, background: accent }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center' }}>
        <div style={{ height: 6, width: '70%', borderRadius: 3, background: '#1A1D2E' }} />
        {line('45%')}
      </div>
      <div style={{ height: 2, width: '100%', background: accent, borderRadius: 3 }} />
    </div>
  );
}


// ─── the popup ──────────────────────────────────────────────────────
export function CoverTemplatePicker({
  templates,
  palettes,
  initialTemplateKey,
  initialBrand,
  initialTypography,
  companyDefault,
  logoUrl,
  applying = false,
  error,
  onApply,
  onClose,
}: {
  templates: CoverTemplate[];
  palettes: ColorPalette[];
  initialTemplateKey: string | null;
  initialBrand: BrandColors | null;
  initialTypography?: Typography | null;
  /**
   * What the company saved on the Brand Identity page. Used only where the
   * report itself has made no choice — a report's own pick always wins — and as
   * the target of the typography Reset link, so "reset" means "back to what our
   * company set" rather than back to the layout's generic blueprint.
   */
  companyDefault?: CompanyDesignDefault | null;
  logoUrl?: string | null;
  applying?: boolean;
  error?: string | null;
  onApply: (payload: CoverSelectionPayload) => void;
  onClose: () => void;
}) {
  const visibleTemplates = useMemo(
    () => templates.filter((t) => t.key.toLowerCase() !== 'branded'),
    [templates],
  );

  const [designKey, setDesignKey] = useState<string>(
    initialTemplateKey
      || companyDefault?.cover_template_key
      || visibleTemplates[0]?.key
      || DEFAULT_LAYOUT_KEY,
  );
  const [brand, setBrand] = useState<BrandColors>(
    initialBrand ?? companyDefault?.brand ?? {
      primary: palettes[0]?.primary ?? '#4B0082',
      secondary: palettes[0]?.secondary ?? '#00B7C2',
      palette_key: palettes[0]?.key ?? '',
    },
  );
  const [customOpen, setCustomOpen] = useState(brand.palette_key === 'custom');

  // Typography state — seeded from the report's saved override if any,
  // else from the picked layout's recommended defaults.
  // What "recommended" means here. The company's saved type wins over the
  // layout blueprint, so a user who matches their own company default is not
  // labelled "Customised" and Reset does not throw that default away.
  const layoutDefaults = useMemo(
    () => companyDefault?.typography ?? templateDefaults(visibleTemplates, designKey),
    [companyDefault, visibleTemplates, designKey],
  );
  const [typography, setTypography] = useState<Typography>(
    initialTypography
      ?? companyDefault?.typography
      ?? templateDefaults(visibleTemplates, designKey),
  );

  // Layout-swap prompt state — pops when the user picks a different
  // layout while their typography is customised. "Switch" replaces
  // typography with the new layout's defaults; "Keep mine" dismisses.
  const [swapPrompt, setSwapPrompt] = useState<{ from: string; to: string; toDefaults: Typography } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const applyPalette = (p: ColorPalette) => {
    setCustomOpen(false);
    setBrand({ primary: p.primary, secondary: p.secondary, palette_key: p.key });
  };
  const setCustom = (patch: Partial<Pick<BrandColors, 'primary' | 'secondary'>>) => {
    setBrand((b) => ({ ...b, ...patch, palette_key: 'custom' }));
  };

  const handleDesignChange = (nextKey: string) => {
    if (nextKey === designKey) return;
    const nextDefaults = templateDefaults(visibleTemplates, nextKey);
    // Silent switch if typography still matches the current layout's
    // defaults; otherwise prompt so a customised choice isn't lost.
    if (hasCustomTypography(typography, layoutDefaults)) {
      setSwapPrompt({
        from: templateName(visibleTemplates, designKey),
        to: templateName(visibleTemplates, nextKey),
        toDefaults: nextDefaults,
      });
      setDesignKey(nextKey);
    } else {
      setDesignKey(nextKey);
      setTypography(nextDefaults);
    }
  };

  const currentVariant = collapseVariant(designKey);
  const lightWarn = isLight(brand.primary);

  // Measure the preview pane so ReportPreview can compute a scale that
  // fits the A4 mock without introducing horizontal scroll.
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [paneWidth, setPaneWidth] = useState(280);
  useLayoutEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const measure = () => setPaneWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Report design"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1400,
        background: 'rgba(20,22,40,.45)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-[1080px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div>
            <div className="text-[15px] font-extrabold text-slate-900">Report design</div>
            <div className="mt-0.5 text-[12px] text-slate-500">Layout, colours and type. Changes preview live.</div>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close" title="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* Body — 2 panes on desktop, stacks under ~900px */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(280px,40%)]">
          {/* Left pane */}
          <div className="flex flex-col gap-6 overflow-y-auto px-6 py-5">
            {/* Layout */}
            <section aria-label="Layout">
              <SectionHeader>Layout</SectionHeader>
              {visibleTemplates.length === 0 ? (
                <div className="py-2 text-[12px] text-slate-400">No cover designs available.</div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {visibleTemplates.map((t, i) => {
                    const active = t.key === designKey;
                    return (
                      <button
                        key={t.key} type="button"
                        onClick={() => handleDesignChange(t.key)}
                        aria-pressed={active}
                        className={
                          'rounded-lg border-2 p-2 text-left transition-colors '
                          + (active
                            ? 'border-indigo-500 bg-indigo-50'
                            : 'border-slate-200 bg-white hover:border-slate-300')
                        }
                      >
                        <div className="relative mb-2 overflow-hidden rounded">
                          {t.preview_image_url ? (
                            <img src={t.preview_image_url} alt={t.name} className="block aspect-[1/1.3] w-full object-cover" />
                          ) : (
                            <MiniCover templateKey={t.key} accent={brand.primary} index={i} />
                          )}
                          {active && (
                            <span
                              aria-hidden
                              className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-white"
                            >
                              <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.2L5 8.7l4.5-5" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </span>
                          )}
                        </div>
                        <div className={'text-[12px] font-bold ' + (active ? 'text-indigo-800' : 'text-slate-900')}>{t.name}</div>
                        {t.description && <div className="mt-0.5 text-[10.5px] leading-snug text-slate-500">{t.description}</div>}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Brand color */}
            <section aria-label="Brand colour">
              <SectionHeader>Brand colour</SectionHeader>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {palettes.map((p) => {
                  const active = brand.palette_key === p.key && !customOpen;
                  return (
                    <button
                      key={p.key} type="button" onClick={() => applyPalette(p)} aria-pressed={active}
                      className={
                        'inline-flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-[12px] font-semibold transition-colors '
                        + (active
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300')
                      }
                    >
                      <span className="inline-flex">
                        <span style={{ width: 14, height: 14, borderRadius: '50% 0 0 50%', background: p.primary }} />
                        <span style={{ width: 14, height: 14, borderRadius: '0 50% 50% 0', background: p.secondary }} />
                      </span>
                      {p.name}
                    </button>
                  );
                })}
                <button
                  type="button" onClick={() => setCustomOpen(true)} aria-pressed={customOpen}
                  className={
                    'inline-flex items-center rounded-full border-2 px-3 py-1.5 text-[12px] font-semibold transition-colors '
                    + (customOpen
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300')
                  }
                >
                  Custom
                </button>
              </div>
              {customOpen && (
                <div className="flex flex-wrap gap-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <HexField label="Primary" value={brand.primary} onChange={(v) => setCustom({ primary: v })} />
                  <HexField label="Secondary" value={brand.secondary} onChange={(v) => setCustom({ secondary: v })} />
                </div>
              )}
              {lightWarn && (
                <div className="mt-2 flex items-center gap-2 text-[11.5px] text-amber-700">
                  <span aria-hidden>⚠</span>
                  This colour may be hard to read as an accent — it&apos;ll be darkened for text on white.
                </div>
              )}
            </section>

            {/* Typography */}
            {swapPrompt && (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900"
              >
                <span>Switch to {swapPrompt.to}&apos;s recommended type?</span>
                <div className="flex gap-2">
                  <button
                    type="button" onClick={() => setSwapPrompt(null)}
                    className="rounded-md border border-amber-300 bg-white px-2 py-1 text-[11.5px] font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    Keep mine
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTypography(swapPrompt.toDefaults); setSwapPrompt(null); }}
                    className="rounded-md bg-amber-900 px-2 py-1 text-[11.5px] font-semibold text-white hover:bg-amber-950"
                  >
                    Switch
                  </button>
                </div>
              </div>
            )}
            <TypographyControls
              value={typography}
              onChange={setTypography}
              layoutName={templateName(visibleTemplates, designKey)}
              layoutDefaults={layoutDefaults}
            />
          </div>

          {/* Right pane — sticky preview */}
          <div className="hidden overflow-y-auto border-l border-slate-100 bg-slate-50/50 px-4 py-5 lg:block">
            <div ref={previewRef} className="mx-auto max-w-[380px]">
              <ReportPreview
                variant={currentVariant}
                brand={brand}
                typography={typography}
                logoUrl={logoUrl ?? null}
                paneWidth={paneWidth}
              />
            </div>
          </div>

          {/* Compact preview at the top on smaller widths — collapsible */}
          <MobilePreview
            variant={currentVariant} brand={brand} typography={typography} logoUrl={logoUrl ?? null}
          />
        </div>

        {error && <div className="border-t border-red-100 bg-red-50 px-6 py-2 text-[12px] text-red-700">{error}</div>}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-3">
          <button type="button" className="btn bs" onClick={onClose} disabled={applying}>Cancel</button>
          <button
            type="button" className="btn bp"
            disabled={applying || !designKey}
            onClick={() => onApply({ cover_template_key: designKey, brand, typography })}
            style={{ opacity: applying || !designKey ? 0.6 : 1 }}
          >
            {applying ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}


function MobilePreview({
  variant, brand, typography, logoUrl,
}: {
  variant: PreviewVariant; brand: BrandColors; typography: Typography; logoUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [paneWidth, setPaneWidth] = useState(280);
  useLayoutEffect(() => {
    if (!open || !previewRef.current) return;
    const el = previewRef.current;
    const measure = () => setPaneWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);
  return (
    <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3 lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-2 text-[12px] font-semibold text-indigo-600 hover:underline"
      >
        {open ? 'Hide preview' : 'Show preview'}
      </button>
      {open && (
        <div ref={previewRef} className="mx-auto max-w-[360px]">
          <ReportPreview
            variant={variant} brand={brand} typography={typography}
            logoUrl={logoUrl} paneWidth={paneWidth}
          />
        </div>
      )}
    </div>
  );
}


function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
      {children}
    </div>
  );
}


function HexField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="max-w-[220px]">
      <div className="mb-1 text-[11px] font-bold text-slate-600">{label}</div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={normalizeHex(value) ?? '#4040c8'}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 cursor-pointer rounded-md border border-slate-200 bg-white p-0"
          aria-label={`${label} color`}
        />
        <input
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const hex = normalizeHex(e.target.value);
            if (hex) onChange(hex);
          }}
          placeholder="#4040C8"
          className="w-[110px] rounded-md border border-slate-200 bg-white px-2 py-2 text-[13px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          style={{ fontFamily: "'DM Mono', monospace" }}
        />
      </div>
    </div>
  );
}


// ── helpers ─────────────────────────────────────────────────────────

function templateName(templates: CoverTemplate[], key: string): string {
  return templates.find((t) => t.key === key)?.name || key || 'Classic';
}

// Prefer the template's own typography blueprint (loaded from the
// server catalogue on modal open — quarterly_cover_templates.layout
// .typography) so the "Recommended for X" hint tracks whatever the
// migration wrote. Fall back to the hardcoded frontend defaults if the
// backend hasn't shipped that layout key yet.
function templateDefaults(templates: CoverTemplate[], key: string): Typography {
  const tmpl = templates.find((t) => t.key === key);
  const fromCatalogue = tmpl?.layout && (tmpl.layout as Record<string, unknown>).typography;
  if (fromCatalogue && typeof fromCatalogue === 'object') {
    return fromCatalogue as Typography;
  }
  return LAYOUT_TYPOGRAPHY_DEFAULTS[collapseVariant(key)] ?? LAYOUT_TYPOGRAPHY_DEFAULTS[DEFAULT_LAYOUT_KEY];
}
