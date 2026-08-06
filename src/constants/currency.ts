// Single source of truth for reporting currencies and figure scales. Never
// hardcode a currency list or a scale multiplier inline — import from here.
//
// Three divergent scale vocabularies already exist across the stack (the parser's
// singular tokens, the document lane's plural tokens, and this API token set), so
// SCALE_FACTOR deliberately accepts every spelling it might be handed rather than
// adding a fourth.

export interface CurrencyOption {
  code: string; // ISO 4217, sent to the backend as-is
  label: string; // Display name shown in selects
}

export const REPORTING_CURRENCIES: CurrencyOption[] = [
  { code: "SAR", label: "SAR — Saudi Riyal" },
  { code: "USD", label: "USD — US Dollar" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "GBP", label: "GBP — British Pound" },
  { code: "AED", label: "AED — UAE Dirham" },
  { code: "QAR", label: "QAR — Qatari Riyal" },
  { code: "KWD", label: "KWD — Kuwaiti Dinar" },
  { code: "BHD", label: "BHD — Bahraini Dinar" },
  { code: "OMR", label: "OMR — Omani Rial" },
];

export const DEFAULT_CURRENCY = "SAR";

// The tokens the generate endpoint accepts for `financial_scale`.
export type FinancialScale = "actual" | "thousands" | "millions" | "billions";

export const FINANCIAL_SCALES: { value: FinancialScale; label: string }[] = [
  { value: "actual", label: "Actual (ones)" },
  { value: "thousands", label: "Thousands" },
  { value: "millions", label: "Millions" },
  { value: "billions", label: "Billions" },
];

// Every spelling the backend or the dashboard might emit, mapped to its
// multiplier. `actual` is the API token; `units`/`ones`/`absolute` come from the
// dashboard's own maps; the singular forms come from the parser.
export const SCALE_FACTOR: Record<string, number> = {
  actual: 1,
  units: 1,
  ones: 1,
  absolute: 1,
  thousand: 1e3,
  thousands: 1e3,
  million: 1e6,
  millions: 1e6,
  billion: 1e9,
  billions: 1e9,
};

export function isFinancialScale(raw: string | null | undefined): raw is FinancialScale {
  return !!raw && FINANCIAL_SCALES.some((s) => s.value === raw);
}

// Upper-cases and validates a currency code against the list above. Returns null
// for anything unrecognised so callers can decide whether to fall back or to
// surface the raw value — never silently swap a company's own currency for SAR.
export function normaliseCurrencyCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  if (!code || code === "UNKNOWN") return null;
  return code;
}

export function isKnownCurrency(code: string | null | undefined): boolean {
  return !!code && REPORTING_CURRENCIES.some((c) => c.code === code);
}
