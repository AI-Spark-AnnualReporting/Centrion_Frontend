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

/** What one credit earns Spark on a pack: the client's price per credit minus
 *  the AI cost one credit covers. null when there's no pack. */
export function packMargin(pack: CreditPack | null | undefined, creditValue: number):
  { pricePerCredit: number; keeps: number; percent: number } | null {
  if (!pack || pack.size <= 0) return null;
  const pricePerCredit = pack.price / pack.size;
  const keeps = pricePerCredit - creditValue;
  const percent = pricePerCredit > 0 ? Math.round((keeps / pricePerCredit) * 100) : 0;
  return { pricePerCredit, keeps, percent };
}

/** True for the backend's "can't start, not enough credits" refusals (403). */
export function isNotEnoughCreditsMessage(message: string | null | undefined): boolean {
  const text = message ?? '';
  return text.startsWith('Not enough AI credits') || text.includes('AI credits to start');
}

// Names that the key alone can't give (they match Centriton's AI_ACTIONS labels).
const ACTION_NAMES: Record<string, string> = {
  'annual.brief': 'Generate brief',
  'annual.brief_refine': 'Refine brief',
  'annual.section': 'Write a section',
  'annual.section_refine': 'Refine a section',
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
