// Brand colors — shared by the onboarding Brand step and the quarterly cover
// picker. They live here rather than in types/quarterly.ts because onboarding
// has nothing to do with quarterly reports; quarterly.ts re-exports them so
// every existing import keeps working.
//
// The same {primary, secondary, palette_key} object is stored in two places
// server-side: companies.brand_colors (the company default, set at onboarding)
// and reports.generation_config.brand (a per-report override). The report's
// value wins when set — see _resolve_brand in Centriton/routes/report_routes.py.

export interface ColorPalette {
  key: string;
  name: string;
  primary: string;
  secondary: string;
}

// palette_key is 'custom' (or '') when the primary/secondary are custom hex values.
export interface BrandColors {
  primary: string;
  secondary: string;
  palette_key: string;
}

// A logo the user picked, already read into the base64 data URI that gets
// stored in companies.logo_base64. name/size are kept only to render the
// preview row — the backend receives dataUri alone.
export interface PickedLogo {
  name: string;
  size: number;
  dataUri: string;
}

// The brand language guideline document, already read to text by the backend.
// `text` is what gets stored in companies.brand_identity; name/chars are shown
// in the picked-file row so the user can see the extraction actually worked.
export interface ExtractedGuideline {
  name: string;
  text: string;
  chars: number;
}

// Mirrors PRESET_COLOR_PALETTES in Centriton/brand_constants.py. Only used as a
// fallback when GET /reports/quarterly/color-palettes can't be reached, so the
// Brand step never blocks onboarding on a network hiccup.
export const FALLBACK_COLOR_PALETTES: ColorPalette[] = [
  { key: "violet_cyan", name: "Violet & Cyan", primary: "#3C0866", secondary: "#5BC9E2" },
  { key: "navy_gold", name: "Navy & Gold", primary: "#0A1F44", secondary: "#C9A227" },
  { key: "green_slate", name: "Green & Slate", primary: "#0B5D3B", secondary: "#64748B" },
];

// What each role actually affects in a generated report — shown next to the
// pickers so the user knows the impact before choosing.
export const PRIMARY_NOTE =
  "Used for main headings, section titles, cover page, and table headers.";
export const SECONDARY_NOTE =
  "Used for highlights, KPI numbers, dividers, and accent borders.";

// ─── colour helpers ───────────────────────────────────────────────────────────

/** '#abc' / 'aabbcc' / '#AABBCC' → '#aabbcc'. Null when it isn't a hex color. */
export function normalizeHex(v: string): string | null {
  let s = v.trim();
  if (!s.startsWith("#")) s = `#${s}`;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    s = "#" + s.slice(1).split("").map((c) => c + c).join("");
  }
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null;
}

/** Relative luminance (0 = black, 1 = white) per WCAG. */
export function luminance(hex: string): number {
  const h = normalizeHex(hex) ?? "#000000";
  const ch = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.4152 * ch[2];
}

/** Too pale to read as an accent on white — the export darkens these for text. */
export const isLight = (hex: string) => luminance(hex) > 0.7;
