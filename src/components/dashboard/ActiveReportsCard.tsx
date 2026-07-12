import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { reports as reportsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

/**
 * Active Reports — real reports from reports.list. There is NO status field on the
 * list rows, so status is derived: generated_at present → "Ready", else "Draft".
 * Progress is the report's coverage percentage when available.
 */

const ACCENT = '#4040C8';

interface ReportRow {
  id: string;
  period: string;
  report_type?: string | null;
  generated_at?: string | null;
  title?: string | null;
  coverage?: { percentage?: number | null } | null;
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

export function ActiveReportsCard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const companyId = user?.company_id ?? null;
  const [reports, setReports] = useState<ReportRow[] | null>(null);

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
      ) : rows.length === 0 ? (
        <div style={{ padding: '18px 2px', fontSize: 12.5, color: '#9BA3C4', lineHeight: 1.6 }}>
          No reports yet. <button type="button" onClick={() => navigate('/reports')} style={{ color: ACCENT, fontWeight: 700, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>Start one →</button>
        </div>
      ) : (
        rows.map((r, i) => {
          const pct = coveragePct(r);
          const ready = Boolean(r.generated_at);
          const status = ready
            ? { text: 'READY', color: '#16A34A', bg: 'rgba(34,197,94,.12)' }
            : { text: 'DRAFT', color: '#B45309', bg: 'rgba(245,158,11,.15)' };
          return (
            <div key={r.id} style={{ display: 'flex', gap: 11, alignItems: 'center', padding: '11px 0', borderTop: i ? '1px solid #F4F5FA' : 'none' }}>
              <span style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: ACCENT, background: 'rgba(64,64,200,.1)' }}>{initials(r.report_type)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1A1D2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title || typeLabel(r.report_type)}</div>
                <div style={{ fontSize: 10.5, color: '#9BA3C4', marginTop: 1 }}>{typeLabel(r.report_type)} · {(r.period || '').replace('-', ' ')}</div>
                {pct != null && (
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
        })
      )}
    </div>
  );
}

export default ActiveReportsCard;
