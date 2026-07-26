import { useEffect, useState } from 'react';
import type {
  CoverTemplate,
  ColorPalette,
  BrandColors,
  CoverSelectionPayload,
} from '@/types/quarterly';

const ACCENT = '#4040C8';
const DARK = '#1A1D2E';
const MUTED = '#6B7280';
const BODY = '#2A2E47';

// What each brand color affects in the report — shown next to the pickers so the
// user knows the impact before choosing.
const PRIMARY_NOTE = 'Used for main headings, section titles, cover page, and table headers.';
const SECONDARY_NOTE = 'Used for highlights, KPI numbers, dividers, and accent borders.';

// ─── colour helpers ───────────────────────────────────────────────────────────
function normalizeHex(v: string): string | null {
  let s = v.trim();
  if (!s.startsWith('#')) s = `#${s}`;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    s = '#' + s.slice(1).split('').map((c) => c + c).join('');
  }
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null;
}

// Relative luminance (0 = black, 1 = white) per WCAG.
function luminance(hex: string): number {
  const h = normalizeHex(hex) ?? '#000000';
  const ch = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.4152 * ch[2];
}
const isLight = (hex: string) => luminance(hex) > 0.7;

// ─── thumbnail mini-preview (when a template has no thumbnail_url) ─────────────
// Distinct look per design: match a known variant by key, otherwise cycle by
// index so every card in the grid is visually differentiable.
const MINI_VARIANTS = ['classic', 'bold', 'minimal'] as const;
function MiniCover({ templateKey, accent, index = 0 }: { templateKey: string; accent: string; index?: number }) {
  const k = templateKey.toLowerCase();
  const variant = k.includes('bold')
    ? 'bold'
    : k.includes('minimal') || k.includes('clean')
      ? 'minimal'
      : k.includes('classic')
        ? 'classic'
        : MINI_VARIANTS[index % MINI_VARIANTS.length];
  const shell: React.CSSProperties = {
    width: '100%', aspectRatio: '1 / 1.3', borderRadius: 6, background: '#fff',
    border: '1px solid #E5E7EF', overflow: 'hidden', display: 'flex', flexDirection: 'column',
  };
  const line = (w: string, c = '#E4E6F1') => (
    <div style={{ height: 5, width: w, borderRadius: 3, background: c }} />
  );
  if (variant === 'bold') {
    return (
      <div style={shell}>
        <div style={{ background: accent, padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ height: 8, width: '70%', borderRadius: 3, background: 'rgba(255,255,255,.9)' }} />
          <div style={{ height: 5, width: '45%', borderRadius: 3, background: 'rgba(255,255,255,.6)' }} />
        </div>
        <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'flex-end' }}>
          {line('60%')}{line('40%')}
        </div>
      </div>
    );
  }
  if (variant === 'minimal') {
    return (
      <div style={{ ...shell, padding: 14, justifyContent: 'center', gap: 8 }}>
        <div style={{ height: 4, width: 26, borderRadius: 3, background: accent }} />
        <div style={{ height: 8, width: '65%', borderRadius: 3, background: DARK }} />
        {line('40%')}
      </div>
    );
  }
  return (
    <div style={{ ...shell, padding: 14, gap: 8 }}>
      <div style={{ height: 5, width: 40, borderRadius: 3, background: accent }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
        <div style={{ height: 8, width: '70%', borderRadius: 3, background: DARK }} />
        {line('45%')}
      </div>
      <div style={{ height: 3, width: '100%', background: accent, borderRadius: 3 }} />
    </div>
  );
}

// ─── the popup ────────────────────────────────────────────────────────────────
export function CoverTemplatePicker({
  templates,
  palettes,
  initialTemplateKey,
  initialBrand,
  applying = false,
  error,
  onApply,
  onClose,
}: {
  templates: CoverTemplate[];
  palettes: ColorPalette[];
  initialTemplateKey: string | null;
  initialBrand: BrandColors | null;
  applying?: boolean;
  error?: string | null;
  onApply: (payload: CoverSelectionPayload) => void;
  onClose: () => void;
}) {
  const [designKey, setDesignKey] = useState<string>(
    initialTemplateKey || templates[0]?.key || '',
  );
  const [brand, setBrand] = useState<BrandColors>(
    initialBrand ?? {
      primary: palettes[0]?.primary ?? ACCENT,
      secondary: palettes[0]?.secondary ?? ACCENT,
      palette_key: palettes[0]?.key ?? '',
    },
  );
  const [customOpen, setCustomOpen] = useState(brand.palette_key === 'custom');

  // The "Branded" design is hidden for now.
  const visibleTemplates = templates.filter((t) => t.key.toLowerCase() !== 'branded');

  // Escape to close.
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

  const lightWarn = isLight(brand.primary);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose cover design and colors"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1400,
        background: 'rgba(20,22,40,.45)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        animation: 'fade-in .2s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(760px, 100%)', maxHeight: '86vh',
          display: 'flex', flexDirection: 'column',
          background: '#fff', borderRadius: 16,
          boxShadow: '0 24px 60px rgba(20,22,40,.28)', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '18px 22px', borderBottom: '1px solid #ECEEF8' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: DARK }}>Choose cover design & colors</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>Colors apply to accents &amp; headings; body text stays dark.</div>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close" title="Close"
            style={{ width: 30, height: 30, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #E5E7EF', background: '#fff', borderRadius: 8, cursor: 'pointer', color: MUTED }}
          >
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 22px', overflowY: 'auto' }}>
          {/* Part A — designs */}
          <SectionLabel>Cover design</SectionLabel>
          {visibleTemplates.length === 0 ? (
            <div style={{ fontSize: 12, color: '#9BA3C4', padding: '6px 0 14px' }}>No cover designs available.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
              {visibleTemplates.map((t, i) => {
                const active = t.key === designKey;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setDesignKey(t.key)}
                    aria-pressed={active}
                    style={{
                      textAlign: 'left', padding: 10, borderRadius: 12, cursor: 'pointer',
                      background: active ? '#EEEEFF' : '#fff',
                      border: `1.5px solid ${active ? ACCENT : '#E4E6F1'}`,
                      transition: 'border-color .12s, background .12s',
                    }}
                  >
                    <div style={{ position: 'relative', borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
                      {t.preview_image_url ? (
                        <img src={t.preview_image_url} alt={t.name} style={{ width: '100%', display: 'block', aspectRatio: '1 / 1.3', objectFit: 'cover' }} />
                      ) : (
                        <MiniCover templateKey={t.key} accent={brand.primary} index={i} />
                      )}
                      {active && (
                        <span
                          aria-hidden
                          style={{
                            position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: '50%',
                            background: ACCENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.2L5 8.7l4.5-5" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: active ? '#2B2B8F' : DARK }}>{t.name}</div>
                    {t.description && <div style={{ fontSize: 11, color: MUTED, marginTop: 2, lineHeight: 1.4 }}>{t.description}</div>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Part B — brand color */}
          <SectionLabel>Brand color</SectionLabel>
          {/* Role legend — what each color affects (live swatches reflect the current choice). */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 14 }}>
            <RoleNote color={brand.primary} label="Primary" note={PRIMARY_NOTE} />
            <RoleNote color={brand.secondary} label="Secondary" note={SECONDARY_NOTE} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {palettes.map((p) => {
              const active = brand.palette_key === p.key && !customOpen;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyPalette(p)}
                  aria-pressed={active}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 12px 7px 8px',
                    borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                    color: active ? '#2B2B8F' : '#3A3F5C',
                    background: active ? '#EEEEFF' : '#fff',
                    border: `1.5px solid ${active ? ACCENT : '#E4E6F1'}`,
                  }}
                >
                  <span style={{ display: 'inline-flex' }}>
                    <span style={{ width: 16, height: 16, borderRadius: '50% 0 0 50%', background: p.primary }} />
                    <span style={{ width: 16, height: 16, borderRadius: '0 50% 50% 0', background: p.secondary }} />
                  </span>
                  {p.name}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setCustomOpen(true)}
              aria-pressed={customOpen}
              style={{
                padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                color: customOpen ? '#2B2B8F' : '#3A3F5C',
                background: customOpen ? '#EEEEFF' : '#fff',
                border: `1.5px solid ${customOpen ? ACCENT : '#E4E6F1'}`,
              }}
            >
              Custom
            </button>
          </div>

          {customOpen && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginBottom: 14, padding: '12px 14px', border: '1px solid #ECEEF8', borderRadius: 10, background: '#FAFBFE' }}>
              <HexField label="Primary" value={brand.primary} onChange={(v) => setCustom({ primary: v })} note={PRIMARY_NOTE} />
              <HexField label="Secondary" value={brand.secondary} onChange={(v) => setCustom({ secondary: v })} note={SECONDARY_NOTE} />
            </div>
          )}

          {/* Live preview */}
          <div style={{ border: '1px solid #ECEEF8', borderRadius: 10, padding: '14px 16px', background: '#fff' }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: MUTED, marginBottom: 8 }}>Preview</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: brand.primary, lineHeight: 1.2 }}>Section heading</div>
            <div style={{ display: 'flex', gap: 24, marginTop: 10, paddingBottom: 6, borderBottom: `2px solid ${brand.primary}`, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: brand.primary }}>
              <span style={{ flex: 1 }}>Metric</span><span>Current</span>
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.6, color: BODY }}>
              Body text stays dark and readable — the brand color only tints headings, table headers and accents.
            </p>
          </div>

          {lightWarn && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#B45309', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span aria-hidden>⚠</span> This color may be hard to read as an accent — it’ll be darkened for text on white.
            </div>
          )}
          {error && <div style={{ marginTop: 10, fontSize: 12, color: '#DC2626' }}>{error}</div>}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: '1px solid #ECEEF8' }}>
          <button type="button" className="btn bs" onClick={onClose} disabled={applying} style={{ fontSize: 13, padding: '9px 18px' }}>
            Cancel
          </button>
          <button
            type="button"
            className="btn bp"
            disabled={applying || !designKey}
            onClick={() => onApply({ cover_template_key: designKey, brand })}
            style={{ fontSize: 13, padding: '10px 22px', opacity: applying || !designKey ? 0.6 : 1 }}
          >
            {applying ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: '#5A6080', marginBottom: 10 }}>
      {children}
    </div>
  );
}

// A live swatch + role label + usage note (Primary / Secondary).
function RoleNote({ color, label, note }: { color: string; label: string; note: string }) {
  return (
    <div style={{ flex: '1 1 260px', minWidth: 240, display: 'flex', gap: 9, alignItems: 'flex-start' }}>
      <span
        style={{ width: 16, height: 16, borderRadius: 5, background: color, flexShrink: 0, marginTop: 1, border: '1px solid rgba(0,0,0,.12)' }}
        aria-hidden
      />
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#3A3F5C' }}>{label}</div>
        <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.45 }}>{note}</div>
      </div>
    </div>
  );
}

function HexField({ label, value, onChange, note }: { label: string; value: string; onChange: (v: string) => void; note?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div style={{ maxWidth: 260 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#3A3F5C', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="color"
          value={normalizeHex(value) ?? '#4040c8'}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 40, height: 34, padding: 0, border: '1px solid #E4E6F1', borderRadius: 8, background: '#fff', cursor: 'pointer' }}
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
          style={{ width: 100, padding: '8px 10px', borderRadius: 8, border: '1.5px solid #E4E6F1', fontSize: 13, fontFamily: "'DM Mono', monospace", color: DARK, outline: 'none' }}
        />
      </div>
      {note && <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.4, marginTop: 6 }}>{note}</div>}
    </div>
  );
}
