// Admin Console → Settings → Usage (cloud, company admin). Two parts:
//   1. Plan: the subscription card that used to sit on the Admin Console
//      overview (plan, limits, modules, Change plan).
//   2. AI credits: what's left (below zero in red), where they came from, what
//      used them, and Buy credits (opens the Buy credits screen).
// Payment and Invoices moved to the Billing tab (BillingPage.tsx).
//
// Route: /admin-console/usage · Plan: Centriton/.claude/plans/admin-usage-page.md

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '@/components/shared/Spinner';
import { LicenseCard } from '@/components/license/LicenseCard';
import { SettingsTabs } from '@/components/admin/SettingsTabs';
import { formatLicenseDate } from '@/components/license/LicenseBanner';
import {
  actionName, formatCredits, formatCreditsDetail,
} from '@/components/ai-credits/creditFormat';
import { aiCredits } from '@/lib/api';
import type { ActionUsage, AiCreditStatus, AiCreditsSummary } from '@/types/ai-credits';

export const BUY_CREDITS_PAGE = '/admin-console/usage/buy-credits';

/** The sentence under the balance. */
export function balanceText(balance: number, total: number): string {
  if (balance < 0) return `${formatCredits(-balance)} credits below zero — AI is paused until you buy more.`;
  if (balance === 0) return 'No credits left — AI is paused until you buy more.';
  return `${formatCredits(balance)} of ${formatCredits(total)} credits left this period.`;
}

/** How full the credits bar is, 0–100 (0 when below zero). */
export function creditsLeftPercent(balance: number, total: number): number {
  if (total <= 0 || balance <= 0) return 0;
  return Math.min(100, Math.round((balance / total) * 100));
}

/** One row of "What used them": a feature with its use this period, its
 *  minimum to start (0 = none) and whether it's paused right now. */
export interface FeatureRow {
  action: string;
  name: string;
  jobs: number;
  credits: number;
  minimum: number | null;    // null when the status couldn't be read
  paused: boolean;
}

/** Every feature: the ones used this period first (most credits first), then
 *  the unused ones, so a paused feature always has a row. Without a status
 *  only the used ones show, with no minimum. */
export function featureRows(used: ActionUsage[], status: AiCreditStatus | null): FeatureRow[] {
  const steps = status?.applies ? status.actions : {};
  const rows: FeatureRow[] = [];
  const seen = new Set<string>();
  const sorted = [...used].sort((a, b) => b.credits - a.credits);
  for (const row of sorted) {
    const step = steps[row.action];
    rows.push({
      action: row.action, name: row.label ?? step?.label ?? actionName(row.action),
      jobs: row.jobs, credits: row.credits,
      minimum: step ? step.minimum : null, paused: step ? !step.allowed : false,
    });
    seen.add(row.action);
  }
  for (const [action, step] of Object.entries(steps)) {
    if (seen.has(action)) continue;
    rows.push({ action, name: step.label ?? actionName(action), jobs: 0, credits: 0,
      minimum: step.minimum, paused: !step.allowed });
  }
  return rows;
}

export default function UsagePage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SettingsTabs />
      {/* Frosted glass over soft colour glows (index.css .glass-stage); only here,
          the on-prem Admin Console's License card stays plain. */}
      <div className="glass-stage">
        <LicenseCard />
      </div>
      <CreditsSection />
    </div>
  );
}

// ── 2. AI credits ───────────────────────────────────────────────────

function CreditsSection() {
  const [summary, setSummary] = useState<AiCreditsSummary | null>(null);
  const [status, setStatus] = useState<AiCreditStatus | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    aiCredits.summary()
      .then((next) => { setSummary(next); setError(''); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load AI credits.'));
    // Minimums and what's paused. A failed read just leaves those columns empty.
    aiCredits.status().then(setStatus).catch(() => undefined);
  }, []);

  if (error) return <div className="card" style={{ padding: 14, fontSize: 12, color: '#DC2626' }}>{error}</div>;
  if (!summary) return <Spinner pad={30} />;

  const period = summary.subscription;
  if (!period) {
    return (
      <Section title="AI credits">
        <div style={{ fontSize: 12, color: '#9BA3C4' }}>
          No active plan, so there are no AI credits. Choose a plan on the Subscription page.
        </div>
      </Section>
    );
  }

  if (period.ended) return <EndedCredits period={period} />;

  const { balance } = period;
  const percent = creditsLeftPercent(balance.balance, balance.total);
  const canBuy = period.credit_packs.length > 0;
  const rows = featureRows(period.by_action, status);
  return (
    <Section title="AI credits"
      line={`This period: ${formatLicenseDate(period.period.starts_at)} – ${formatLicenseDate(period.period.ends_at)}. Unused credits move to your next plan.`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 30, fontWeight: 800, color: balance.balance <= 0 ? '#DC2626' : '#1A1D2E' }}>
            {formatCredits(balance.balance)}
            <span style={{ fontSize: 13, fontWeight: 600, color: '#9BA3C4' }}> credits left of {formatCredits(balance.total)}</span>
          </div>
          <div style={{ fontSize: 12, color: balance.low || balance.balance <= 0 ? '#B45309' : '#9BA3C4' }}>
            {balanceText(balance.balance, balance.total)}
          </div>
        </div>
        {canBuy ? (
          <Link to={BUY_CREDITS_PAGE} className="btn bp" style={{ textDecoration: 'none' }}>Buy credits</Link>
        ) : (
          <span style={{ fontSize: 12, color: '#9BA3C4' }}>Extra credits aren&apos;t on sale yet. Contact Centriyon.</span>
        )}
      </div>
      <div role="progressbar" aria-label="AI credits left" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}
        style={{ height: 8, borderRadius: 8, background: '#ECEEF8', marginTop: 12, overflow: 'hidden' }}>
        <div style={{ width: `${percent}%`, height: '100%', background: balance.low ? '#D97706' : '#4040C8' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 14 }}>
        <Figure title="Included in your plan" value={formatCredits(balance.included)} />
        <Figure title="Bought this period" value={formatCredits(balance.packs)} />
        {balance.carried < 0 && <Figure title="Minus from last period" value={formatCredits(balance.carried)} />}
        {/* Unused bought credits move to the next plan (carry-bought-credits.md). */}
        {balance.carried > 0 && <Figure title="Carried from last plan" value={formatCredits(balance.carried)} />}
        <Figure title="Used this period" value={formatCreditsDetail(balance.used)} />
      </div>

      <div style={{ fontSize: 12, fontWeight: 800, margin: '18px 0 6px' }}>What used them</div>
      <table className="utable">
        <thead>
          <tr>
            <th>Feature</th><th style={{ textAlign: 'right' }}>Times used</th><th style={{ textAlign: 'right' }}>Credits</th>
            <th style={{ textAlign: 'right' }}>Minimum to start</th><th aria-label="State" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr className="urow"><td colSpan={5} style={{ color: '#9BA3C4' }}>No AI used yet this period.</td></tr>
          )}
          {rows.map((row) => (
            <tr key={row.action} className="urow">
              <td><b>{row.name}</b></td>
              <td style={{ textAlign: 'right' }}>{row.jobs}</td>
              <td style={{ textAlign: 'right' }}>{formatCreditsDetail(row.credits)}</td>
              <td style={{ textAlign: 'right' }}>{row.minimum ? formatCredits(row.minimum) : '—'}</td>
              <td style={{ textAlign: 'right', width: 90 }}>
                {row.paused && (
                  <span className="badge b-am" title="Your balance is below this feature's minimum, so it can't start. Buy credits to turn it back on.">
                    Paused
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

/** The plan has ended: AI is off, and every unused credit waits for the next
 *  plan (carry-bought-credits.md). Renewing is on the expired banner above. */
function EndedCredits({ period }: { period: NonNullable<AiCreditsSummary['subscription']> }) {
  const waiting = period.carry_to_next ?? 0;
  const rows = featureRows(period.by_action, null);
  return (
    <Section title="AI credits"
      line={`Your plan ended on ${formatLicenseDate(period.period.ends_at)}. AI is paused until you renew.`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          {waiting > 0 ? (
            <>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#1A1D2E' }}>
                {formatCredits(waiting)}
                <span style={{ fontSize: 13, fontWeight: 600, color: '#9BA3C4' }}> credits waiting</span>
              </div>
              <div style={{ fontSize: 12, color: '#5A6080' }}>
                They move to your next plan when you renew.
              </div>
            </>
          ) : waiting < 0 ? (
            <div style={{ fontSize: 13, color: '#DC2626' }}>
              Your last plan ended {formatCredits(-waiting)} credits below zero. That comes off your next plan&apos;s credits.
            </div>
          ) : (
            <div style={{ fontSize: 13, color: '#5A6080' }}>No credits are left to carry over.</div>
          )}
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, margin: '18px 0 6px' }}>What used them (last period)</div>
      <table className="utable">
        <thead><tr><th>Feature</th><th style={{ textAlign: 'right' }}>Times used</th><th style={{ textAlign: 'right' }}>Credits</th></tr></thead>
        <tbody>
          {rows.length === 0 && (
            <tr className="urow"><td colSpan={3} style={{ color: '#9BA3C4' }}>No AI was used during this plan.</td></tr>
          )}
          {rows.map((row) => (
            <tr key={row.action} className="urow">
              <td><b>{row.name}</b></td>
              <td style={{ textAlign: 'right' }}>{row.jobs}</td>
              <td style={{ textAlign: 'right' }}>{formatCreditsDetail(row.credits)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

// ── Small pieces ────────────────────────────────────────────────────


export function Section({ title, line, children, className }: {
  title: string; line?: string; children: ReactNode;
  className?: string;   // extra class, e.g. Billing's full-height Invoices card
}) {
  return (
    <section className={className ? `card ${className}` : 'card'} aria-label={title} style={{ padding: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 800 }}>{title}</div>
      {line && <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 2, marginBottom: 10 }}>{line}</div>}
      {!line && <div style={{ marginBottom: 10 }} />}
      {children}
    </section>
  );
}

function Figure({ title, value }: { title: string; value: string }) {
  return (
    <div style={{ background: '#FAFBFE', border: '1px solid #ECEEF8', borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#5A6080' }}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}
