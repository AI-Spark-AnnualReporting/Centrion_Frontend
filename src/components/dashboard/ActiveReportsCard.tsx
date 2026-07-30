import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { reports as reportsApi, sarCycles } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Cycle } from '@/types/cycles';
import { ProgressBar, safePct } from '@/pages/annual-report/cycle-ui';
import { statusPill, type StatusPill } from './report-status';

/**
 * Active Reports — real reports from reports.list (status derived from generation_config),
 * plus the company's Annual Report cycles (SAR backend, admin-only) with their progress
 * bars. An assembled cycle whose report is approved shows an APPROVED pill.
 */

const ACCENT = '#4040C8';

interface ReportRow {
  id: string;
  period: string;
  report_type?: string | null;
  generated_at?: string | null;
  title?: string | null;
  // metrics_total is the size of the ESG indicator universe this report was measured
  // against — 0 means the coverage metric doesn't apply, not "0% covered".
  coverage?: { percentage?: number | null; metrics_total?: number | null } | null;
  // Set only when the app generated the report; null for docs uploaded at onboarding.
  generation_config?: Record<string, unknown> | null;
  // reports.status — draft | in_review | pending_approval | approved | locked | published.
  status?: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  annual: 'Annual Report',
  quarterly: 'Quarterly Report',
  esg: 'ESG / Sustainability',
  board_pack: 'Board Pack',
  ir_briefing: 'IR Briefing',
};

function typeLabel(t?: string | null): string {
  const k = (t ?? '').toLowerCase();
  return TYPE_LABEL[k] ?? (t ? t.replace(/_/g, ' ') : 'Report');
}

function initials(t?: string | null): string {
  const k = (t ?? '').toLowerCase();
  const map: Record<string, string> = { annual: 'AR', quarterly: 'QR', esg: 'SR', board_pack: 'BP', ir_briefing: 'IR' };
  return map[k] ?? (t || 'R').slice(0, 2).toUpperCase();
}

function coveragePct(r: ReportRow): number | null {
  const p = r.coverage?.percentage;
  if (p == null || !Number.isFinite(p)) return null;
  return Math.max(0, Math.min(100, Math.round(p <= 1 ? p * 100 : p)));
}

// Docs banked at onboarding carry no generation_config and all sit at 'draft' — "you
// uploaded this" tells the reader more, so it wins. Everything else shows its real status.
function rowPill(r: ReportRow, uploaded: boolean): StatusPill {
  if (uploaded) return { text: 'UPLOADED', color: ACCENT, bg: 'rgba(64,64,200,.12)' };
  return statusPill(r.status);
}

// Three independent reasons the coverage bar carries no meaning:
//   • uploaded docs have no generation progress at all;
//   • quarterly reports are never measured on ESG coverage (product decision);
//   • an empty indicator universe scores 0% by construction, not by performance — the
//     backend's _pct returns 0.0 rather than null when the denominator is zero.
function showCoverageBar(r: ReportRow, uploaded: boolean, pct: number | null): boolean {
  if (uploaded || pct == null) return false;
  if ((r.report_type ?? '').toLowerCase() === 'quarterly') return false;
  return Boolean(r.coverage?.metrics_total);
}

// Cycle progress — prefer the server-computed value, fall back to submitted/total.
function cyclePct(c: Cycle): number {
  if (Number.isFinite(c.progress as number)) return safePct(c.progress);
  if (Number.isFinite(c.completion_rate as number)) return safePct(c.completion_rate);
  if (c.total_departments) return safePct(((c.submitted ?? 0) / c.total_departments) * 100);
  return 0;
}

export function ActiveReportsCard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const companyId = user?.company_id ?? null;
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [cycles, setCycles] = useState<Cycle[] | null>(null);

  useEffect(() => {
    if (!companyId) {
      setReports([]);
      return;
    }
    let cancelled = false;
    reportsApi
      .list<{ reports?: ReportRow[] }>(companyId)
      .then((r) => { if (!cancelled) setReports(r?.reports ?? []); })
      .catch(() => { if (!cancelled) setReports([]); });
    return () => { cancelled = true; };
  }, [companyId]);

  useEffect(() => {
    // Annual-report cycles live on a separate, admin-only backend — best-effort.
    if (user?.role !== 'admin') { setCycles([]); return; }
    let cancelled = false;
    sarCycles.list()
      .then((cs) => { if (!cancelled) setCycles(cs ?? []); })
      .catch(() => { if (!cancelled) setCycles([]); });
    return () => { cancelled = true; };
  }, [user?.role]);

  const rows = (reports ?? [])
    .slice()
    .sort((a, b) => {
      const ya = Number(a.period?.match(/(\d{4})/)?.[1] ?? 0);
      const yb = Number(b.period?.match(/(\d{4})/)?.[1] ?? 0);
      if (yb !== ya) return yb - ya;
      return (b.generated_at ?? '').localeCompare(a.generated_at ?? '');
    })
    .slice(0, 4);

  return (
    <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#0F9D6B', flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.6px', textTransform: 'uppercase', color: '#5A6080' }}>Active Reports</span>
        </div>
        <button type="button" onClick={() => navigate('/reports')} style={{ fontSize: 12, fontWeight: 700, color: ACCENT, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>All →</button>
      </div>
      <div style={{ height: 1, background: '#ECEEF8', margin: '8px 0 2px' }} />

      {reports === null ? (
        <div style={{ padding: '18px 0', fontSize: 12.5, color: '#9BA3C4' }}>Loading…</div>
      ) : rows.length === 0 && (cycles?.length ?? 0) === 0 ? (
        <div style={{ padding: '18px 2px', fontSize: 12.5, color: '#9BA3C4', lineHeight: 1.6 }}>
          No reports yet. <button type="button" onClick={() => navigate('/reports')} style={{ color: ACCENT, fontWeight: 700, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>Start one →</button>
        </div>
      ) : (
        <>
        {rows.map((r, i) => {
          const pct = coveragePct(r);
          // No generation_config ⇒ the app didn't generate this; it was uploaded at onboarding.
          const gc = r.generation_config;
          const uploaded = !gc || Object.keys(gc).length === 0;
          const status = rowPill(r, uploaded);
          return (
            <div key={r.id} style={{ display: 'flex', gap: 11, alignItems: 'center', padding: '11px 0', borderTop: i ? '1px solid #F4F5FA' : 'none' }}>
              <span style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: ACCENT, background: 'rgba(64,64,200,.1)' }}>{initials(r.report_type)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1A1D2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title || typeLabel(r.report_type)}</div>
                <div style={{ fontSize: 10.5, color: '#9BA3C4', marginTop: 1 }}>{typeLabel(r.report_type)} · {(r.period || '').replace('-', ' ')}</div>
                {/* An empty 0% bar reads as "stalled" — only draw it where the coverage
                    figure actually measures something. See showCoverageBar. */}
                {showCoverageBar(r, uploaded, pct) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <div style={{ flex: 1, height: 5, borderRadius: 999, background: '#EEF0F6', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: pct >= 75 ? '#16A34A' : pct >= 50 ? '#E8A33D' : '#E5484D', borderRadius: 999 }} />
                    </div>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: '#5A6080', minWidth: 30, textAlign: 'right' }}>{pct}%</span>
                  </div>
                )}
              </div>
              <span style={{ fontSize: 9, fontWeight: 800, color: status.color, background: status.bg, padding: '3px 8px', borderRadius: 999, letterSpacing: '.4px', flexShrink: 0 }}>{status.text}</span>
            </div>
          );
        })}

        {(cycles ?? []).length > 0 && (
          <>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.5px', color: '#9BA3C4', textTransform: 'uppercase', marginTop: rows.length ? 14 : 6, marginBottom: 2 }}>Annual Report Cycles</div>
            {(cycles ?? []).slice(0, 3).map((c) => {
              const pct = cyclePct(c);
              const approved = (c.report_status ?? '').toLowerCase() === 'approved';
              const pill = approved
                ? { text: 'APPROVED', color: '#16A34A', bg: 'rgba(34,197,94,.12)' }
                : { text: (c.status || 'draft').toUpperCase().replace(/_/g, ' '), color: ACCENT, bg: 'rgba(64,64,200,.12)' };
              return (
                <div
                  key={c.id}
                  onClick={() => navigate(`/annual-report/cycles/${c.id}`)}
                  role="button"
                  tabIndex={0}
                  style={{ cursor: 'pointer', display: 'flex', gap: 11, alignItems: 'center', padding: '11px 0', borderTop: '1px solid #F4F5FA' }}
                >
                  <span style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: ACCENT, background: 'rgba(64,64,200,.1)' }}>AR</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1A1D2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.cycle_name || c.name || `Annual Report ${c.fiscal_year}`}</div>
                    <div style={{ fontSize: 10.5, color: '#9BA3C4', marginTop: 1 }}>Reporting Cycle · FY {c.fiscal_year}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <div style={{ flex: 1 }}><ProgressBar pct={pct} width="100%" /></div>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#5A6080', minWidth: 30, textAlign: 'right' }}>{pct}%</span>
                    </div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 800, color: pill.color, background: pill.bg, padding: '3px 8px', borderRadius: 999, letterSpacing: '.4px', flexShrink: 0 }}>{pill.text}</span>
                </div>
              );
            })}
          </>
        )}
        </>
      )}
    </div>
  );
}

export default ActiveReportsCard;
