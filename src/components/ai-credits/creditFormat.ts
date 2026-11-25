// Small helpers shared by the AI credit screens. Pure, so they're easy to test.
// Plan: Centriton/.claude/plans/ai-credits.md

import type { CreditPack } from '@/types/ai-credits';

/** Credits as people read them: whole numbers with commas, a real minus sign
 *  ("5,000", "−95"). The backend keeps 2 decimals; screens round. */
export function formatCredits(value: number | null | undefined): string {
  if (value == null) return '—';
  const rounded = Math.round(value);
  const text = Math.abs(rounded).toLocaleString('en-US');
  return rounded < 0 ? `−${text}` : text;
}

/** Dollars with cents: "$0.08", "$352.10". */
export function formatDollars(value: number | null | undefined, decimals = 2): string {
  if (value == null) return '—';
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

/** Credits with one decimal under 10, so small uses don't look like nothing
 *  ("0.2", "3.5", "1,250"). */
export function formatCreditsDetail(value: number | null | undefined): string {
  if (value == null) return '—';
  if (Math.abs(value) >= 10) return formatCredits(value);
  const text = Math.abs(value).toFixed(1);
  return value < 0 ? `−${text}` : text;
}

/** What a pack charges per credit: $50 for 500 → 0.1. */
export function pricePerCredit(pack: { credits: number; price: number }): number {
  return pack.credits > 0 ? pack.price / pack.credits : 0;
}

/** The lowest price a pack may have: its credits' AI cost, rounded up to the
 *  cent (500 credits at $0.02 → $10). Same rule as the backend. */
export function packMinimumPrice(credits: number, creditValue: number): number {
  return Math.ceil(Number((credits * creditValue * 100).toFixed(6))) / 100;
}

/** How much cheaper per credit a pack is than the smallest pack, in whole
 *  percent ("save 10%"); 0 for the smallest pack itself or a dearer one. */
export function packSavingPercent(pack: CreditPack, packs: CreditPack[]): number {
  if (packs.length === 0) return 0;
  const smallest = packs.reduce((a, b) => (b.credits < a.credits ? b : a));
  const base = pricePerCredit(smallest);
  if (base <= 0 || pack.id === smallest.id) return 0;
  const saving = Math.round((1 - pricePerCredit(pack) / base) * 100);
  return saving > 0 ? saving : 0;
}

/** A date and time as people read them: "18 Nov 2026" (no "Invalid Date" for
 *  full timestamps). '—' when empty or unreadable. */
export function formatPaidDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** True for the backend's "can't start, not enough credits" refusals (403). */
export function isNotEnoughCreditsMessage(message: string | null | undefined): boolean {
  const text = message ?? '';
  return text.startsWith('Not enough AI credits') || text.includes('AI credits to start');
}

// Names that the key alone can't give (they match Centriton's AI_ACTIONS labels).
const ACTION_NAMES: Record<string, string> = {
  'annual.brief': 'Generate brief',
  'annual.refine': 'Refine',
  'annual.section': 'Write a section',
  'annual.department_draft': 'Department draft',
  'annual.chat': 'Department chat message',
  'centriyon.copilot': 'AI Copilot message',
};

/** An action key as words: "annual.design.custom_template" → "Custom template". */
export function actionName(key: string): string {
  if (ACTION_NAMES[key]) return ACTION_NAMES[key];
  const last = key.split('.').pop() ?? key;
  const words = last.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** This month as the usage page asks for it: "2026-11". */
export function monthOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
