import { useEffect, useMemo, useState } from 'react';
import { Spinner } from '@/components/shared/Spinner';
import { useNavigate } from 'react-router-dom';
import { sarCycles } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useFeaturePermissions } from '@/lib/features';
import type { Cycle, CycleStatus } from '@/types/cycles';
import { initialsOf, gradientFor } from '@/lib/avatar';
import CycleForm from './CycleForm';
import {
  CycleStatusBadge,
  ProgressBar,
  formatCycleDate,
  isOverdue,
} from './cycle-ui';

const PRIMARY = '#4040C8';

type Filter = 'all' | 'active' | 'draft' | 'completed';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'draft', label: 'Draft' },
  { key: 'completed', label: 'Completed' },
];

// Cycle progress as a 0–100 number, tolerant of which field the API populates.
function cyclePct(c: Cycle): number {
  if (typeof c.progress === 'number') return c.progress;
  if (typeof c.completion_rate === 'number') return c.completion_rate;
  if (c.total_departments && c.submitted != null)
    return Math.round((c.submitted / c.total_departments) * 100);
  return 0;
}

function StatTile({
  icon,
  value,
  label,
  hint,
  amber,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  hint: string;
  amber?: boolean;
}) {
  return (
    <div
      className="card"
      style={{
        flex: 1,
        minWidth: 0,
        padding: 16,
        ...(amber ? { background: '#FFFBEB', borderColor: '#FCE7B0' } : {}),
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: amber ? 'rgba(245,158,11,.14)' : '#EEEEFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: amber ? '#B45309' : PRIMARY,
          marginBottom: 12,
        }}
      >
        {icon}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 800,
          color: amber ? '#B45309' : '#1A1D2E',
          lineHeight: 1,
          fontFamily: "'DM Mono', monospace",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1D2E', marginTop: 8 }}>{label}</div>
      <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 2 }}>{hint}</div>
    </div>
  );
}

export default function CyclesListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canCreate: canCreateAnnual, canRead: canReadAnnual } = useFeaturePermissions('annual_report');
  const canManage = user?.role === 'admin' && canCreateAnnual;
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const fetchCycles = () => {
    setLoading(true);
    setError('');
    sarCycles
      .list()
      .then(setCycles)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load cycles.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!canReadAnnual) {
      setLoading(false);
      return;
    }
    fetchCycles();
  }, [canReadAnnual]);

  const counts = useMemo(() => {
    const byStatus = (s: CycleStatus) => cycles.filter((c) => c.status === s).length;
    return {
      all: cycles.length,
      active: byStatus('active'),
      draft: byStatus('draft'),
      completed: byStatus('completed'),
    };
  }, [cycles]);

  const avgProgress = useMemo(() => {
    if (cycles.length === 0) return 0;
    const sum = cycles.reduce((acc, c) => acc + cyclePct(c), 0);
    return Math.round(sum / cycles.length);
  }, [cycles]);

  const overdueCount = useMemo(
    () => cycles.filter((c) => isOverdue(c.submission_deadline, c.status)).length,
    [cycles],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cycles.filter((c) => {
      if (filter !== 'all' && c.status !== filter) return false;
      if (q) {
        const hay = `${c.cycle_name ?? c.name ?? ''} ${c.fiscal_year} ${c.project_manager_name ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [cycles, filter, search]);

  const th: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    color: '#9BA3C4',
    textTransform: 'uppercase',
    letterSpacing: '.5px',
    textAlign: 'left',
    padding: '12px 16px',
  };
  const td: React.CSSProperties = { fontSize: 12, color: '#1A1D2E', padding: '14px 16px' };

  return (
    <div style={{ paddingBottom: 96 }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1A1D2E' }}>Reporting Cycles</h1>
        <p style={{ fontSize: 12, color: '#5A6080', marginTop: 2 }}>
          {canManage
            ? 'Create a new reporting cycle, then track them across fiscal years.'
            : 'Track annual report cycles across fiscal years.'}
        </p>
      </div>

      {/* Create cycle form — admins only (ESG-style). Refreshes list on create. */}
      {canManage && (
        <CycleForm onCreated={(cycle) => navigate(`/annual-report/cycles/${cycle.id}`)} />
      )}

      {canReadAnnual && (
      <>
      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
        <StatTile
          icon={<svg viewBox="0 0 14 14" width="15" height="15" fill="none"><circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3" /><path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>}
          value={counts.active}
          label="Active cycles"
          hint="in progress"
        />
        <StatTile
          icon={<svg viewBox="0 0 14 14" width="15" height="15" fill="none"><path d="M9 2l3 3-7 7H2v-3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>}
          value={counts.draft}
          label="Drafts"
          hint="not yet started"
        />
        <StatTile
          icon={<svg viewBox="0 0 14 14" width="15" height="15" fill="none"><path d="M2 7.5l3.5 3.5L12 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          value={counts.completed}
          label="Completed"
          hint="published"
        />
        <StatTile
          amber
          icon={<svg viewBox="0 0 14 14" width="15" height="15" fill="none"><path d="M1.5 9.5l3-3.5 2 2.5L9 5l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /><rect x="1" y="1" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" /></svg>}
          value={`${avgProgress}%`}
          label="Avg. progress"
          hint={`${overdueCount} overdue`}
        />
      </div>

      {/* Filters + search */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid #ECEEF8',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div className="tabs" style={{ marginBottom: 0 }}>
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={`tab ${filter === f.key ? 'act' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label} {counts[f.key]}
              </button>
            ))}
          </div>
          <div style={{ position: 'relative', width: 260 }}>
            <input
              className="inp"
              placeholder="Search cycle, year or manager"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 30 }}
            />
            <svg viewBox="0 0 13 13" width="13" height="13" fill="none" style={{ position: 'absolute', left: 11, top: 12, color: '#9BA3C4' }}>
              <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8.5 8.5l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {loading ? (
          <Spinner />
        ) : error ? (
          <div style={{ padding: 32, textAlign: 'center', fontSize: 12, color: '#5A6080' }}>{error}</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1D2E' }}>No cycles found</div>
            <div style={{ fontSize: 12, color: '#9BA3C4', marginTop: 4 }}>
              Create a cycle or adjust your filters.
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#FAFBFE', borderBottom: '1px solid #ECEEF8' }}>
                <th style={th}>Cycle name</th>
                <th style={th}>Project manager</th>
                <th style={th}>Deadline</th>
                <th style={th}>Progress</th>
                <th style={th}>Status</th>
                <th style={{ ...th, width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const pct = cyclePct(c);
                const overdue = isOverdue(c.submission_deadline, c.status);
                return (
                  <tr key={c.id} style={{ borderTop: '1px solid #F4F5FB' }}>
                    <td style={td}>
                      <div style={{ fontWeight: 700, color: '#1A1D2E' }}>{c.cycle_name ?? c.name}</div>
                      <div style={{ fontSize: 10, color: '#9BA3C4', marginTop: 1 }}>FY{c.fiscal_year}</div>
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="av" style={{ background: gradientFor(c.project_manager_id || c.id), width: 26, height: 26, fontSize: 9 }}>
                          {initialsOf(c.project_manager_name ?? '—')}
                        </span>
                        <span style={{ color: '#1A1D2E' }}>{c.project_manager_name ?? '—'}</span>
                      </div>
                    </td>
                    <td style={{ ...td, color: overdue ? '#DC2626' : '#5A6080', fontWeight: overdue ? 700 : 400 }}>
                      {overdue && <span style={{ marginRight: 4 }}>⚑</span>}
                      {formatCycleDate(c.submission_deadline)}
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {c.submitted != null && c.total_departments != null && (
                          <span style={{ fontSize: 11, color: PRIMARY, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>
                            {c.submitted}/{c.total_departments}
                          </span>
                        )}
                        <ProgressBar pct={pct} width={90} />
                        <span style={{ fontSize: 11, color: '#5A6080', fontFamily: "'DM Mono', monospace" }}>{pct}%</span>
                      </div>
                    </td>
                    <td style={td}>
                      <CycleStatusBadge status={c.status} />
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <button
                        className="btn bs bsm"
                        type="button"
                        onClick={() => navigate(`/annual-report/cycles/${c.id}`)}
                        style={{ padding: '4px 12px' }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      </>
      )}
    </div>
  );
}
