/*
 * ReportPreview.tsx — the sticky right pane of the Report Design modal.
 *
 * Renders a scaled A4 mock (real px on a 595×842 logical canvas, shrunk
 * with CSS transform to fit the pane) with a Cover|Page segmented toggle.
 * Every element is annotated with the template/CSS it imitates so future
 * edits to the real templates can keep this preview in step:
 *
 *   Cover view  →  templates/reports/default/cover.html (variant blocks)
 *   Page view   →  templates/reports/default/section.html + base.css
 *                  + bold_nav.html (Bold running header)
 *                  + report_export.py::_stamp_pdf_header_footer (bars,
 *                    classic/minimal rule, footer text)
 *
 * Pure React/CSS, no server calls. Brand colours + typography drive the
 * output; the modal repaints as the user tweaks the left-pane controls.
 */
import { useState, useMemo } from 'react';
import type { Typography, BrandColors } from '@/types/quarterly';

export type PreviewVariant = 'classic' | 'bold' | 'minimal';
type ViewMode = 'cover' | 'page';

// A4 in CSS pixels @ 96 DPI (Chromium's page.pdf() unit). Keep in sync
// with pdf_engine._PT_PER_INCH: 595pt × 4/3 = 793.33px, but for on-screen
// preview we treat the logical canvas as 595 px so `font-size: 14px`
// visually matches how the backend renders 14 CSS-px content on an A4
// print — the preview's transform: scale() shrinks the whole thing.
const A4_LOGICAL_W = 595;
const A4_LOGICAL_H = 842;
const CONTENT_MARGIN = 50;   // matches pdf_engine._PAGE_MARGIN_PT for classic/minimal
const BOLD_HEADER_H = 34;    // matches _BOLD_HEADER_H
const BOLD_FOOTER_H = 24;    // matches _BOLD_FOOTER_H
const BOLD_LOGO_CELL_W = 56; // matches _BOLD_LOGO_CELL_W


// Contrast picker (WCAG-ish luminance), same rule as the backend
// _on_color_text_hex uses so the pill text on primary matches.
function onColor(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return (0.2126 * r + 0.7152 * g + 0.4152 * b) > 0.6 ? '#1A1A1A' : '#ffffff';
}


// Backend logic: `'IBM Plex Sans', sans-serif` when spaces present, else
// plain. Reproduced client-side so the preview matches the PDF's stack.
function ff(family: string): string {
  if (family === 'DejaVu Sans') return 'sans-serif';
  return family.includes(' ') ? `'${family}', sans-serif` : `${family}, sans-serif`;
}


export function ReportPreview({
  variant,
  brand,
  typography,
  logoUrl,
  paneWidth,
}: {
  variant: PreviewVariant;
  brand: BrandColors;
  typography: Typography;
  logoUrl: string | null;
  /** Available inner width of the preview pane in CSS px — drives the
   * transform scale so the A4 mock fits without introducing horizontal
   * scroll. Height follows the aspect ratio. */
  paneWidth: number;
}) {
  const [view, setView] = useState<ViewMode>('cover');
  const scale = useMemo(() => (paneWidth > 0 ? paneWidth / A4_LOGICAL_W : 0.5), [paneWidth]);
  const scaledHeight = A4_LOGICAL_H * scale;

  return (
    <div className="flex flex-col gap-2">
      {/* Toggle */}
      <div className="inline-flex self-center overflow-hidden rounded-md border border-slate-200 bg-white">
        {(['cover', 'page'] as const).map((m) => {
          const active = view === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setView(m)}
              aria-pressed={active}
              className={
                'px-3 py-1 text-[11.5px] transition-colors '
                + (active ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-slate-500 hover:bg-slate-50')
              }
            >
              {m === 'cover' ? 'Cover' : 'Page'}
            </button>
          );
        })}
      </div>

      {/* Canvas — logical A4 wrapped in a transform-scaled container so
       * every child renders at real CSS px on a 595-wide page, then the
       * whole thing shrinks to fit the pane. */}
      <div
        className="relative overflow-hidden rounded-md border border-slate-200 bg-slate-50 shadow-inner"
        style={{ height: scaledHeight }}
      >
        <div
          style={{
            width: A4_LOGICAL_W,
            height: A4_LOGICAL_H,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            background: '#ffffff',
            position: 'absolute',
            top: 0,
            left: 0,
          }}
        >
          {view === 'cover' ? (
            <CoverView variant={variant} brand={brand} typography={typography} logoUrl={logoUrl} />
          ) : (
            <PageView variant={variant} brand={brand} typography={typography} logoUrl={logoUrl} />
          )}
        </div>
      </div>
    </div>
  );
}


// ── Cover view ──────────────────────────────────────────────────────
// Imitates templates/reports/default/cover.html per variant block. Every
// value here mirrors the CSS in that template — if you change one there,
// change it here too.

function CoverView({
  variant, brand, typography, logoUrl,
}: { variant: PreviewVariant; brand: BrandColors; typography: Typography; logoUrl: string | null }) {
  const primary = brand.primary || '#4B0082';
  const onBrand = onColor(primary);
  const headingFF = ff(typography.heading.family);

  // Cover h1 sizes match cover.html per-variant: Classic 28, Minimal 26,
  // Bold 32. Weight is per-variant (Classic default, Minimal 700, Bold 700).
  if (variant === 'bold') {
    // Bold: full-bleed brand band edge-to-edge, logo directly on band
    // (no plaque), title in on-brand at 32px.
    return (
      <div style={{ height: '100%' }}>
        <div style={{
          background: primary,
          padding: '40px 50px',
          color: onBrand,
        }}>
          {logoUrl && (
            <img
              src={logoUrl}
              alt=""
              style={{ maxHeight: 44, maxWidth: 150, display: 'block', marginBottom: 30, objectFit: 'contain' }}
            />
          )}
          <h1 style={{
            fontFamily: headingFF, fontSize: 32, fontWeight: 700,
            color: onBrand, margin: 0, textAlign: 'start',
          }}>
            Acme Q3 2024 Quarterly Report
          </h1>
          <div style={{ color: onBrand, fontSize: 13, marginTop: 10, textAlign: 'start' }}>
            Q3 2024 · Prepared 30 August 2026
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'minimal') {
    // Minimal: 110px top padding, small logo top-right, left title +
    // ▌ accent mark, no rule.
    return (
      <div style={{ padding: '110px 50px 0 50px' }}>
        {logoUrl && (
          <div style={{ textAlign: 'end', marginBottom: 13 }}>
            <img src={logoUrl} alt="" style={{ maxHeight: 36, maxWidth: 120, display: 'inline-block', objectFit: 'contain' }} />
          </div>
        )}
        <h1 style={{
          fontFamily: headingFF, fontSize: 26, fontWeight: 700,
          color: primary, margin: 0, textAlign: 'start',
        }}>
          <span style={{ color: primary }}>▌ </span>
          Acme Q3 2024 Quarterly Report
        </h1>
        <div style={{ color: '#666666', fontSize: 12, marginTop: 10, textAlign: 'start' }}>
          Q3 2024 · Prepared 30 August 2026
        </div>
      </div>
    );
  }

  // Classic (default): centered title with brand rule under, logo top.
  return (
    <div style={{ padding: '50px' }}>
      {logoUrl && (
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <img src={logoUrl} alt="" style={{ maxHeight: 64, maxWidth: 200, display: 'inline-block', objectFit: 'contain' }} />
        </div>
      )}
      <h1 style={{
        fontFamily: headingFF, fontSize: 28,
        color: primary, textAlign: 'center', margin: 0,
        borderBottom: `3px solid ${primary}`, paddingBottom: 8,
      }}>
        Acme Q3 2024 Quarterly Report
      </h1>
      <div style={{ color: '#666666', fontSize: 12, marginTop: 10, textAlign: 'center' }}>
        Q3 2024 · Prepared 30 August 2026
      </div>
    </div>
  );
}


// ── Page view ───────────────────────────────────────────────────────
// Running header + section content + running footer. Header shape per
// variant matches _stamp_pdf_header_footer + bold_nav.html.

function PageView({
  variant, brand, typography, logoUrl,
}: { variant: PreviewVariant; brand: BrandColors; typography: Typography; logoUrl: string | null }) {
  const primary   = brand.primary   || '#4B0082';
  const secondary = brand.secondary || primary;
  const onBrand     = onColor(primary);
  const onSecondary = onColor(secondary);

  const headingFF = ff(typography.heading.family);
  const subFF     = ff(typography.subheading.family);
  const bodyFF    = ff(typography.body.family);

  // Content area — starts below the header allowance, ends above the
  // footer allowance. Matches base.css / stamper spacing.
  const contentTop = variant === 'bold' ? 64 : (variant === 'minimal' ? 40 : CONTENT_MARGIN);
  const contentBot = variant === 'bold' ? 56 : CONTENT_MARGIN;

  return (
    <div style={{ height: '100%', position: 'relative' }}>
      {/* Running header — variant-specific */}
      {variant === 'bold' ? <BoldHeader brand={brand} logoUrl={logoUrl} onBrand={onBrand} onSecondary={onSecondary} secondary={secondary} primary={primary} />
        : variant === 'minimal' ? <MinimalHeader logoUrl={logoUrl} />
        : <ClassicHeader logoUrl={logoUrl} primary={primary} />}

      {/* Content — mirrors section.html + base.css using the picked
       * typography vars inline (the backend renders these via
       * :root { --font-heading: ...; --size-heading: ...; ... }). */}
      <div style={{
        position: 'absolute',
        top: contentTop,
        left: CONTENT_MARGIN,
        right: CONTENT_MARGIN,
        bottom: contentBot,
        overflow: 'hidden',
      }}>
        <h2 style={{
          fontFamily: headingFF, fontSize: typography.heading.size,
          fontWeight: typography.heading.weight, color: primary, margin: '0 0 10px 0',
        }}>
          Executive Summary
        </h2>
        <h3 style={{
          fontFamily: subFF, fontSize: typography.subheading.size,
          fontWeight: typography.subheading.weight, margin: '14px 0 6px 0', color: '#1A1A1A',
        }}>
          1.1 Highlights
        </h3>
        <p style={{
          fontFamily: bodyFF, fontSize: typography.body.size, fontWeight: typography.body.weight,
          lineHeight: 1.5, textAlign: 'justify', margin: '0 0 8px 0', color: '#1A1A1A',
        }}>
          Revenue grew twelve per cent year over year, driven by strong performance in upstream production and continued expansion of the downstream business.
        </p>
        <p style={{
          fontFamily: bodyFF, fontSize: typography.body.size, fontWeight: typography.body.weight,
          lineHeight: 1.5, textAlign: 'justify', margin: '0 0 12px 0', color: '#1A1A1A',
        }}>
          Free cash flow of SAR 168.6 billion supported a base dividend of SAR 73.2 billion and the first performance-linked dividend of SAR 9.9 billion.
        </p>
        {/* Table — mirrors base.css th (brand text + 3px brand bottom border), td left-align */}
        <table style={{
          width: '100%', borderCollapse: 'collapse',
          fontFamily: bodyFF, fontSize: typography.body.size - 1,
        }}>
          <thead>
            <tr>
              <th style={{
                textAlign: 'left', padding: '4px 6px', border: '1px solid #ccc',
                fontWeight: typography.heading.weight, color: primary,
                borderBottom: `3px solid ${primary}`,
              }}>Line item</th>
              <th style={{
                textAlign: 'left', padding: '4px 6px', border: '1px solid #ccc',
                fontWeight: typography.heading.weight, color: primary,
                borderBottom: `3px solid ${primary}`,
              }}>Current</th>
            </tr>
          </thead>
          <tbody>
            {[['Revenue', 'SAR 100,603M'], ['Net income', 'SAR 45,231M'], ['Free cash flow', 'SAR 168,617M']].map(([l, v]) => (
              <tr key={l}>
                <td style={{ textAlign: 'left', padding: '4px 6px', border: '1px solid #ccc' }}>{l}</td>
                <td style={{ textAlign: 'left', padding: '4px 6px', border: '1px solid #ccc' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Running footer — variant-specific */}
      {variant === 'bold' ? <BoldFooter primary={primary} onBrand={onBrand} />
        : <ClassicOrMinimalFooter primary={primary} />}
    </div>
  );
}


// ── Header variants ─────────────────────────────────────────────────

function BoldHeader({
  brand, logoUrl, onBrand, onSecondary, secondary, primary,
}: { brand: BrandColors; logoUrl: string | null; onBrand: string; onSecondary: string; secondary: string; primary: string }) {
  // Matches templates/reports/default/bold_nav.html — 5 equal cells +
  // logo cell. Current section = middle slot (index 2) with the
  // secondary pill. No white plaque behind the logo (transparent).
  const cells = ['Executive', 'Financial', 'Cash Flows', 'Balance', 'Segment Results'];
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, height: BOLD_HEADER_H,
      display: 'flex', background: primary, color: onBrand,
    }}>
      <div style={{
        flex: `0 0 ${BOLD_LOGO_CELL_W}px`, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'transparent', padding: 4, boxSizing: 'border-box',
      }}>
        {logoUrl && <img src={logoUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />}
      </div>
      {cells.map((c, i) => {
        const isCurrent = i === 2;
        const noLeftDivider = i === 0 || isCurrent || (i === 3 /* the cell after current */);
        return (
          <div
            key={c}
            style={{
              flex: '1 1 0', minWidth: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              padding: '3px 6px', boxSizing: 'border-box',
              fontSize: 9, lineHeight: 1.15, textAlign: 'center',
              borderInlineStart: noLeftDivider ? '0' : '1px solid rgba(255,255,255,0.25)',
              background: isCurrent ? secondary : 'transparent',
              color:      isCurrent ? onSecondary : onBrand,
              fontWeight: isCurrent ? 700 : 400,
            }}
          >
            {c}
          </div>
        );
      })}
    </div>
  );
}

function ClassicHeader({ logoUrl, primary }: { logoUrl: string | null; primary: string }) {
  // Matches _stamp_pdf_header_footer classic path: logo left, company
  // name center-left, "Quarterly Report - Q3 2024" right, brand rule
  // beneath. Bar sits at y=26–44, rule at y=46.
  return (
    <div style={{ position: 'absolute', top: 26, left: 50, right: 50, height: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', height: '100%', gap: 6 }}>
        {logoUrl && <img src={logoUrl} alt="" style={{ maxHeight: 14, maxWidth: 64, objectFit: 'contain' }} />}
        <span style={{ fontSize: 9, color: '#666666', flex: 1 }}>Acme Corp</span>
        <span style={{ fontSize: 9, color: '#666666' }}>Quarterly Report - Q3 2024</span>
      </div>
      <div style={{ position: 'absolute', left: -0, right: -0, top: 20, height: 0.75, background: primary }} />
    </div>
  );
}

function MinimalHeader({ logoUrl }: { logoUrl: string | null }) {
  // Matches _stamp_pdf_header_footer minimal path: only logo, higher
  // position (y=12–30), no rule, no text.
  if (!logoUrl) return null;
  return (
    <div style={{ position: 'absolute', top: 12, left: 50, height: 18 }}>
      <img src={logoUrl} alt="" style={{ maxHeight: 14, maxWidth: 64, objectFit: 'contain' }} />
    </div>
  );
}


// ── Footer variants ─────────────────────────────────────────────────

function BoldFooter({ primary, onBrand }: { primary: string; onBrand: string }) {
  // Full-bleed primary bar bottom, company left + kind · Page N right.
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, height: BOLD_FOOTER_H,
      background: primary, color: onBrand,
      display: 'flex', alignItems: 'center', padding: '0 50px', boxSizing: 'border-box',
      fontSize: 9,
    }}>
      <span style={{ flex: 1 }}>Acme Corp</span>
      <span>Quarterly Report - Q3 2024  ·  Page 3 of 14</span>
    </div>
  );
}

function ClassicOrMinimalFooter({ primary }: { primary: string }) {
  // Classic + Minimal share the same footer treatment: rule + text.
  return (
    <div style={{ position: 'absolute', bottom: 26, left: 50, right: 50, height: 18 }}>
      <div style={{ position: 'absolute', left: -0, right: -0, top: -4, height: 0.75, background: primary }} />
      <div style={{ display: 'flex', alignItems: 'center', height: '100%', fontSize: 9, color: '#666666' }}>
        <span style={{ flex: 1 }}>Acme Corp</span>
        <span>Page 3 of 14</span>
      </div>
    </div>
  );
}
