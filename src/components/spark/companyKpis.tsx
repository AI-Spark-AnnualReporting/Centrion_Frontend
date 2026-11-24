// Small pieces shared by Spark → Companies (the list's KPI columns) and the
// company dashboard. Plan: Centriton/.claude/plans/spark-company-dashboard.md

import type { CreditBalance } from '@/types/ai-credits';
import type { SparkPlanStatus, SparkPlanSummary } from '@/types/spark';
import { formatCredits } from '@/components/ai-credits/creditFormat';

const DAY_MS = 24 * 60 * 60 * 1000;
// "ends in 12 days" shows this close to the end.
export const ENDING_SOON_DAYS = 30;

const STATUS_TEXT: Record<SparkPlanStatus, string> = {
  active: 'Active',
  expired: 'Expired',
  not_started: 'Not started',
  none: 'No plan',
};

const STATUS_BADGE: Record<SparkPlanStatus, string> = {
  active: 'b-gn',
  expired: 'b-rd',
  not_started: 'b-am',
  none: 'b-gy',
};

/** Whole days from today to a YYYY-MM-DD date (negative once it has passed). */
export function daysUntil(day: string, today: Date = new Date()): number {
  const target = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((target - now) / DAY_MS);
}

/** "ends in 12 days" / "ends today" for an active plan close to its end, else ''. */
export function endingSoonText(plan: SparkPlanSummary | null | undefined, today: Date = new Date()): string {
  if (!plan || plan.status !== 'active') return '';
  const days = daysUntil(plan.ends_at, today);
  if (days > ENDING_SOON_DAYS) return '';
  if (days <= 0) return 'ends today';
  return days === 1 ? 'ends tomorrow' : `ends in ${days} days`;
}

/** A YYYY-MM-DD date as "19 Nov 2026". */
export function formatDay(day: string | null | undefined): string {
  if (!day) return '—';
  const date = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function PlanStatusChip({ status }: { status: SparkPlanStatus }) {
  return <span className={`badge ${STATUS_BADGE[status]}`}>{STATUS_TEXT[status]}</span>;
}

/** 'red' below zero, 'amber' when low, '' otherwise. */
export function creditTone(credits: CreditBalance): '' | 'amber' | 'red' {
  if (credits.balance < 0) return 'red';
  return credits.low ? 'amber' : '';
}

const TONE_COLOUR = { '': '#4040C8', amber: '#D97706', red: '#DC2626' };

/** A thin bar: how full something is, 0–100%. */
export function Meter({ percent, tone = '', label }: { percent: number; tone?: '' | 'amber' | 'red'; label: string }) {
  const width = Math.max(0, Math.min(100, percent));
  return (
    <div role="meter" aria-label={label} aria-valuenow={Math.round(width)} aria-valuemin={0} aria-valuemax={100}
      style={{ height: 6, background: '#ECEDF7', borderRadius: 99, overflow: 'hidden', margin: '5px 0 3px' }}>
      <div style={{ width: `${width}%`, height: '100%', background: TONE_COLOUR[tone], borderRadius: 99 }} />
    </div>
  );
}

/** "123 / 300 left" with a bar (amber when low, red below zero). */
export function CreditsLeft({ credits }: { credits: CreditBalance }) {
  const tone = creditTone(credits);
  const percent = credits.total > 0 ? (credits.balance / credits.total) * 100 : 0;
  return (
    <div>
      <div style={{ fontVariantNumeric: 'tabular-nums', color: tone === 'red' ? '#DC2626' : '#1A1D2E' }}>
        <b>{formatCredits(credits.balance)}</b>
        <span style={{ color: '#5A6080' }}> / {formatCredits(credits.total)} left</span>
      </div>
      <Meter percent={percent} tone={tone} label="AI credits left" />
    </div>
  );
}
