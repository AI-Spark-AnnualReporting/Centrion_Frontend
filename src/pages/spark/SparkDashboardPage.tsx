// Spark console overview — the platform-owner view across every tenant.
// Deliberately just the numbers: three counts and the comparison chart. The
// lists live at /spark/:section, reached from the sidebar, so this screen stays
// readable and a 103-row table isn't the first thing you meet.
//
// Read-only. Nothing here mutates a tenant; that stays in the tenant's own
// Admin Console, where the JWT scopes it.

import { useEffect, useState } from 'react';
import { Spinner } from '@/components/shared/Spinner';
import { spark } from '@/lib/api';
import type { SparkOverview } from '@/types/spark';
import { ReportTrendsCard } from '@/components/spark/ReportTrendsCard';
import { SECTIONS, SECTION_KEYS, type SectionKey } from '@/constants/spark-sections';

const PRIMARY = '#4040C8';

function SectionIcon({ section }: { section: SectionKey }) {
  if (section === 'companies') {
    return (
      <svg viewBox="0 0 14 14" width="16" height="16" fill="none">
        <path d="M1.5 12.5V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v9.5M8 12.5V6h3.5a1 1 0 0 1 1 1v5.5M1 12.5h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3.5 4.5h2M3.5 7h2M3.5 9.5h2M10 8.5v.01M10 10.5v.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (section === 'reports') {
    return (
      <svg viewBox="0 0 14 14" width="16" height="16" fill="none">
        <rect x="2" y="1.5" width="10" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M4.5 5h5M4.5 7.5h5M4.5 10h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 14 14" width="16" height="16" fill="none">
      <circle cx="5.5" cy="4.5" r="2.3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1.5 12c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M9.5 2.6a2.3 2.3 0 0 1 0 4.3M10.6 8.4c1.2.5 2 1.7 2 3.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function StatCard({
  section,
  value,
  title,
  hint,
}: {
  section: SectionKey;
  value: number;
  title: string;
  hint: string;
}) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 0, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            background: '#EEEEFF',
            color: PRIMARY,
          }}
        >
          <SectionIcon section={section} />
        </span>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#1A1D2E', letterSpacing: '-.1px' }}>
          {title}
        </span>
      </div>
      <div
        style={{
          fontSize: 34,
          fontWeight: 800,
          lineHeight: 1,
          marginTop: 14,
          fontFamily: "'DM Mono', monospace",
          letterSpacing: '-1px',
          color: '#1A1D2E',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, marginTop: 6, color: '#9BA3C4' }}>{hint}</div>
    </div>
  );
}

export default function SparkDashboardPage() {
  const [overview, setOverview] = useState<SparkOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    spark
      .overview()
      .then((res) => alive && setOverview(res))
      .catch(
        (e) =>
          alive && setError(e instanceof Error ? e.message : 'Failed to load the overview.'),
      )
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <Spinner pad={80} />;

  if (error || !overview) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1D2E' }}>
          Couldn’t load the Spark console
        </div>
        <div style={{ fontSize: 12, color: '#5A6080', marginTop: 6 }}>
          {error || 'No data returned.'}
        </div>
      </div>
    );
  }

  const counts: Record<SectionKey, number> = {
    companies: overview.total_companies,
    reports: overview.total_reports,
    users: overview.total_users,
  };

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              background: 'linear-gradient(135deg,#4040C8,#5B5BE0)',
              boxShadow: '0 4px 12px rgba(64,64,200,.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}
          >
            <svg viewBox="0 0 14 14" width="13" height="13" fill="none">
              <path d="M7 1l1.7 3.6L12.5 5 9.8 7.7l.7 3.8L7 9.7l-3.5 1.8.7-3.8L1.5 5l3.8-.4z" fill="currentColor" />
            </svg>
          </span>
          <h2 style={{ fontSize: 19, fontWeight: 800, color: '#1A1D2E', letterSpacing: '-.3px' }}>
            Spark Admin
          </h2>
        </div>
        <p style={{ fontSize: 12, color: '#5A6080', marginTop: 4 }}>
          Every company on the platform, and the users and reports inside them.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
        {SECTION_KEYS.map((key) => (
          <StatCard
            key={key}
            section={key}
            value={counts[key]}
            title={SECTIONS[key].title}
            hint={SECTIONS[key].cardHint}
          />
        ))}
      </div>

      <ReportTrendsCard companies={overview.companies} />
    </div>
  );
}
