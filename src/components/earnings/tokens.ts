// Shared indigo palette for the Earnings screens. Per the approved plan, earnings
// matches the app's existing indigo look (no violet/cyan tokens). Centralised here
// so the earnings components don't each re-declare the same hexes.
export const INK = '#1A1D2E';
export const MUTED = '#5A6080';
export const FAINT = '#9BA3C4';
export const ACCENT = '#4040C8';
export const ACCENT_TINT = '#EEEEFF';
export const BORDER = '#E2E4F0';
export const BORDER_SOFT = '#ECEEF8';
export const DANGER = '#E5484D';

// Report-content accent — the user's chosen cover/brand color, applied to the
// rendered document only (cover, section headings, table headers, KPI numbers).
// Falls back to the app indigo when no brand is set. Do NOT use for product-UI
// chrome (buttons, chips, rails) — that stays indigo via ACCENT (D-05). The
// preview page sets --brand-primary/--brand-secondary on the document container.
export const BRAND = 'var(--brand-primary, #4040C8)';
export const BRAND_SECONDARY = 'var(--brand-secondary, #4040C8)';
