import type { ReportTone } from '@/types/earnings';

// Report tone — exactly the 7 options (mirrors the quarterly CTX_TONES).
export const EARNINGS_TONES: { label: string; value: ReportTone; desc: string }[] = [
  { label: 'Formal corporate', value: 'formal_corporate', desc: 'Measured, board-ready register' },
  { label: 'Investor-focused', value: 'investor_focused', desc: 'Leads with returns and outlook' },
  { label: 'Data-driven', value: 'data_driven', desc: 'Figures first, minimal narrative' },
  { label: 'Executive summary', value: 'executive_summary', desc: 'Concise, decision-oriented' },
  { label: 'Compliance-focused', value: 'compliance_focused', desc: 'Aligned to CMA / SAMA disclosure' },
  { label: 'Strategic / visionary', value: 'strategic_visionary', desc: 'Forward-looking, thematic' },
  { label: 'Simple and direct', value: 'simple_direct', desc: 'Plain language, no jargon' },
];

// The tone pre-selected on mount.
export const DEFAULT_EARNINGS_TONE: ReportTone = 'investor_focused';
