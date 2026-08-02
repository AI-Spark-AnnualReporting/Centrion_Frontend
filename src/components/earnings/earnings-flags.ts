import type { EarningsVariant } from '@/types/earnings';

// Report types hidden from the Earnings setup screen.
//
// Annual is hidden at the client's request — temporarily, so it lives behind
// this flag rather than being deleted. TO BRING IT BACK: empty this array. That
// is the whole change; the annual code path (fiscal-year-only period fields,
// the `variant: 'annual'` payload, the backend) is untouched and still covered
// by earnings-setup.test.tsx, which overrides this flag so that coverage
// doesn't rot while the option is off-screen.
export const HIDDEN_EARNINGS_VARIANTS: EarningsVariant[] = ['annual'];
