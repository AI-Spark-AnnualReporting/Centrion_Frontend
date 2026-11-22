// Spark admin → AI usage. One month across every company: credits charged,
// the AI cost worked out from our own token counts, OpenAI's real bill (Costs
// API — "Not connected" without an OpenAI admin key), how far apart they are,
// then the totals by action and by company (companies below zero in orange).
//
// Route: /spark/ai-credits/usage · Plan: Centriton/.claude/plans/ai-credits.md

import { useCallback, useEffect, useState } from 'react';
import { Spinner } from '@/components/shared/Spinner';
import { formatCredits, formatDollars, monthOf } from '@/components/ai-credits/creditFormat';
import { sparkAiCredits } from '@/lib/api';
import type { MonthlyUsage, OpenAiBill } from '@/types/ai-credits';

const PAGE_SIZE = 20;
const ACTIONS_PER_PAGE = 10;

/** How far our own total is from OpenAI's bill, in %; null when the bill isn't known. */
export function billDifference(ourCost: number, bill: OpenAiBill): number | null {
  if (bill.cost_usd == null || bill.cost_usd === 0) return null;
  return Math.round((Math.abs(bill.cost_usd - ourCost) / bill.cost_usd) * 1000) / 10;
}

export default function SparkAiUsagePage() {
  const [month, setMonth] = useState(() => monthOf(new Date()));
  const [page, setPage] = useState(1);
  // The API sends every action at once, so this table pages on the client.
  const [actionPage, setActionPage] = useState(1);
  const [usage, setUsage] = useState<MonthlyUsage | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    sparkAiCredits.usage({ month, page, limit: PAGE_SIZE })
      .then((next) => { setUsage(next); setError(''); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load usage.'))
      .finally(() => setLoading(false));
  }, [month, page]);

  useEffect(load, [load]);

  // Action names as people read them ("Custom template"), from the minimums list.
  useEffect(() => {
    sparkAiCredits.actions()
      .then(({ items }) => setLabels(Object.fromEntries(items.map((action) => [action.key, action.label]))))
      .catch(() => undefined);
  }, []);

  if (loading && !usage) return <Spinner pad={80} />;

  const difference = usage ? billDifference(usage.cost_usd, usage.openai_bill) : null;
  const pages = usage ? Math.max(1, Math.ceil(usage.companies.total / PAGE_SIZE)) : 1;
  const actionPages = usage ? Math.max(1, Math.ceil(usage.by_action.length / ACTIONS_PER_PAGE)) : 1;
  const firstAction = (actionPage - 1) * ACTIONS_PER_PAGE;
  const shownActions = usage ? usage.by_action.slice(firstAction, firstAction + ACTIONS_PER_PAGE) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>AI usage</div>
          <div style={{ fontSize: 12, color: '#9BA3C4', marginTop: 2 }}>
            Checks our prices: what our system worked out from tokens, next to what OpenAI really billed.
          </div>
        </div>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#5A6080' }}>
          Month{' '}
          <input className="inp" type="month" value={month} aria-label="Month"
            onChange={(e) => { if (e.target.value) { setMonth(e.target.value); setPage(1); setActionPage(1); } }} />
        </label>
      </div>
      {error && <div className="card" style={{ padding: 14, fontSize: 12, color: '#DC2626' }}>{error}</div>}

      {usage && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <StatCard title="Credits charged" value={formatCredits(usage.credits)} hint="all companies" />
            <StatCard title="AI cost, from our tokens" value={formatDollars(usage.cost_usd)} hint="tokens × model prices" />
            <StatCard title="OpenAI's real bill" value={billText(usage.openai_bill)}
              hint={usage.openai_bill.connected ? (usage.openai_bill.error ?? "from OpenAI's costs page") : 'Add an OpenAI admin key to connect'} />
            <StatCard title="Difference" value={difference == null ? '—' : `${difference}%`}
              hint={difference == null ? 'needs the real bill' : difference <= 5 ? 'Close: prices look right' : 'Check the model prices'}
              tone={difference == null ? undefined : difference <= 5 ? 'good' : 'warn'} />
          </div>

          {usage.unpriced_models.length > 0 && (
            <div className="card" style={{ padding: 12, fontSize: 12, color: '#B45309', background: '#FFF7ED' }}>
              No price for {usage.unpriced_models.join(', ')} — their use costs 0 until you add one on AI credits → Model prices.
            </div>
          )}

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', fontSize: 13, fontWeight: 800 }}>By action</div>
            <div style={{ overflowX: 'auto' }}>
              <table className="utable" style={{ width: '100%', fontSize: 12 }}>
                <thead><tr><th>Action</th><th>Jobs</th><th>Credits charged</th><th>Average per job</th><th>AI cost</th></tr></thead>
                <tbody>
                  {usage.by_action.length === 0 && (
                    <tr className="urow"><td colSpan={5} style={{ color: '#9BA3C4' }}>No AI use this month.</td></tr>
                  )}
                  {shownActions.map((row) => (
                    <tr key={row.action} className="urow">
                      <td><b>{labels[row.action] ?? row.action}</b></td>
                      <td>{row.jobs}</td>
                      <td>{formatCredits(row.credits)}</td>
                      <td>{row.jobs > 0 ? formatCredits(row.credits / row.jobs) : '—'}</td>
                      <td>{formatDollars(row.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {actionPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '10px 16px', fontSize: 12 }}>
                <button type="button" className="btn bs" disabled={actionPage <= 1} onClick={() => setActionPage(actionPage - 1)}>Previous</button>
                <span>Page {actionPage} of {actionPages}</span>
                <button type="button" className="btn bs" disabled={actionPage >= actionPages} onClick={() => setActionPage(actionPage + 1)}>Next</button>
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', fontSize: 13, fontWeight: 800 }}>By company</div>
            <div style={{ overflowX: 'auto' }}>
              <table className="utable" style={{ width: '100%', fontSize: 12 }}>
                <thead><tr><th>Company</th><th>Plan</th><th>Balance now</th><th>Credits this month</th><th>AI cost</th></tr></thead>
                <tbody>
                  {usage.companies.items.length === 0 && (
                    <tr className="urow"><td colSpan={5} style={{ color: '#9BA3C4' }}>No company used AI this month.</td></tr>
                  )}
                  {usage.companies.items.map((row) => {
                    const below = (row.balance?.balance ?? 0) < 0;
                    return (
                      <tr key={row.company_id ?? 'unassigned'} className="urow">
                        <td><b>{row.company_name}</b></td>
                        <td style={{ color: '#5A6080' }}>{row.plan_name ?? '—'}</td>
                        <td style={{ color: below ? '#B45309' : undefined, fontWeight: below ? 700 : undefined }}>
                          {row.balance ? `${formatCredits(row.balance.balance)} of ${formatCredits(row.balance.total)}` : '—'}
                        </td>
                        <td>{formatCredits(row.credits)}</td>
                        <td>{formatDollars(row.cost_usd)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '10px 16px', fontSize: 12 }}>
                <button type="button" className="btn bs" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                <span>Page {page} of {pages}</span>
                <button type="button" className="btn bs" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function billText(bill: OpenAiBill): string {
  if (!bill.connected) return 'Not connected';
  return bill.cost_usd == null ? '—' : formatDollars(bill.cost_usd);
}

function StatCard({ title, value, hint, tone }: { title: string; value: string; hint: string; tone?: 'good' | 'warn' }) {
  const colour = tone === 'good' ? '#15803D' : tone === 'warn' ? '#B45309' : '#1A1D2E';
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#5A6080' }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: colour, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: tone ? colour : '#9BA3C4', marginTop: 2 }}>{hint}</div>
    </div>
  );
}
