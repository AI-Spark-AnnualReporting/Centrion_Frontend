import type { EarningsOutlineSection, EarningsVariant } from '@/types/earnings';

// Report types hidden from the Earnings setup screen.
//
// Annual is hidden at the client's request — temporarily, so it lives behind
// this flag rather than being deleted. TO BRING IT BACK: empty this array. That
// is the whole change; the annual code path (fiscal-year-only period fields,
// the `variant: 'annual'` payload, the backend) is untouched and still covered
// by earnings-setup.test.tsx, which overrides this flag so that coverage
// doesn't rot while the option is off-screen.
export const HIDDEN_EARNINGS_VARIANTS: EarningsVariant[] = ['annual'];

// The sections that carry figures. Only these can be renamed and opened up on the
// Outline: a company renaming its Cover is a different question from one renaming
// the table its own numbers land in, and only these have a figure flow worth
// explaining. `mode` comes straight from the earnings_sections catalogue.
export const isFinancialSection = (s: EarningsOutlineSection) =>
  s.mode === 'table' || s.mode === 'kpi';
