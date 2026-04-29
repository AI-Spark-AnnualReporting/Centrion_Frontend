import { useEffect, useMemo, useState } from 'react';
import { ApiError, companies as companiesApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { CompanyQuestion, CompanyQuestionsResponse } from '@/types/report';

const PILLAR_TONE: Record<string, { color: string; bg: string; label: string }> = {
  E: { color: '#16A34A', bg: 'rgba(22,163,74,.12)', label: 'Environmental' },
  S: { color: '#0891B2', bg: 'rgba(8,145,178,.12)', label: 'Social' },
  G: { color: '#7C3AED', bg: 'rgba(124,58,237,.12)', label: 'Governance' },
  ESG: { color: '#4040C8', bg: 'rgba(64,64,200,.12)', label: 'Universal' },
};

const STATUS_TONE: Record<string, { color: string; bg: string }> = {
  draft: { color: '#B45309', bg: 'rgba(245,158,11,.14)' },
  approved: { color: '#16A34A', bg: 'rgba(34,197,94,.14)' },
  published: { color: '#2563EB', bg: 'rgba(37,99,235,.14)' },
};

function pillarTone(pillar: string) {
  return PILLAR_TONE[pillar] ?? { color: '#5A6080', bg: 'rgba(90,96,128,.12)', label: pillar || 'Other' };
}

function statusTone(status: string) {
  return STATUS_TONE[status] ?? { color: '#5A6080', bg: 'rgba(90,96,128,.12)' };
}

function formatPeriod(period: string): string {
  return period.replace(/-/g, ' ').trim();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return formatDate(iso);
}

interface ReportGroup {
  reportId: string;
  period: string;
  reportType: string;
  status: string;
  createdAt: string;
  questions: CompanyQuestion[];
}

function groupByReport(questions: CompanyQuestion[]): ReportGroup[] {
  const map = new Map<string, ReportGroup>();
  for (const q of questions) {
    const key = q.report.id;
    let group = map.get(key);
    if (!group) {
      group = {
        reportId: q.report.id,
        period: q.report.period,
        reportType: q.report.report_type,
        status: q.report.status,
        createdAt: q.report.created_at,
        questions: [],
      };
      map.set(key, group);
    }
    group.questions.push(q);
  }
  // Newest report first; within each report newest question first.
  const groups = Array.from(map.values());
  for (const g of groups) {
    g.questions.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  groups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return groups;
}

function QuestionCard({ q }: { q: CompanyQuestion }) {
  const tone = pillarTone(q.indicator.esg_pillar);
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #ECEEF8',
        borderRadius: 12,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span
          style={{
            fontFamily: "'DM Mono',monospace",
            fontSize: 9,
            fontWeight: 700,
            color: '#4040C8',
            background: 'rgba(64,64,200,.08)',
            padding: '3px 7px',
            borderRadius: 4,
            letterSpacing: '.3px',
          }}
        >
          {q.indicator.framework} {q.indicator.source_code}
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 800,
            color: tone.color,
            background: tone.bg,
            padding: '3px 8px',
            borderRadius: 999,
            letterSpacing: '.3px',
          }}
        >
          {tone.label}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9BA3C4' }} title={formatDate(q.created_at)}>
          {formatRelative(q.created_at)}
        </span>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1D2E', lineHeight: 1.4 }}>
        {q.indicator.indicator_label}
      </div>
      <div
        style={{
          fontSize: 12,
          color: '#1A1D2E',
          lineHeight: 1.55,
          background: '#F8F9FE',
          border: '1px solid #ECEEF8',
          borderRadius: 8,
          padding: '10px 12px',
          whiteSpace: 'pre-wrap',
        }}
      >
        {q.question_text}
      </div>
    </div>
  );
}

function ReportSection({ group }: { group: ReportGroup }) {
  const tone = statusTone(group.status);
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid #ECEEF8',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'linear-gradient(135deg,#3535B5,#6366F1)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 4px 10px rgba(64,64,200,.18)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M3 2.5h7l3 3v8a.5.5 0 0 1-.5.5h-9.5a.5.5 0 0 1-.5-.5v-10.5a.5.5 0 0 1 .5-.5z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
            <path d="M10 2.5v3h3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1D2E', letterSpacing: '-.1px' }}>
            {formatPeriod(group.period)} · {group.reportType.toUpperCase()} report
          </div>
          <div style={{ fontSize: 10, color: '#9BA3C4', marginTop: 2 }}>
            Created {formatDate(group.createdAt)} · {group.questions.length}{' '}
            {group.questions.length === 1 ? 'question' : 'questions'}
          </div>
        </div>
        <span
          style={{
            fontSize: 9,
            fontWeight: 800,
            color: tone.color,
            background: tone.bg,
            padding: '4px 10px',
            borderRadius: 999,
            textTransform: 'uppercase',
            letterSpacing: '.4px',
            flexShrink: 0,
          }}
        >
          {group.status}
        </span>
      </div>
      <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
        {group.questions.map((q) => (
          <QuestionCard key={q.id} q={q} />
        ))}
      </div>
    </div>
  );
}

export function QuestionsPage() {
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;

  const [questions, setQuestions] = useState<CompanyQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      setError('No company context available.');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    companiesApi
      .listQuestions<CompanyQuestionsResponse>(companyId)
      .then((res) => {
        if (cancelled) return;
        setQuestions(res.questions ?? []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof ApiError
          ? `Couldn't load questions (${err.status}).`
          : "Couldn't load questions.";
        setError(msg);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return questions;
    return questions.filter((row) => {
      return (
        row.question_text.toLowerCase().includes(q) ||
        row.indicator.indicator_label.toLowerCase().includes(q) ||
        row.indicator.source_code.toLowerCase().includes(q) ||
        row.indicator.framework.toLowerCase().includes(q) ||
        row.report.period.toLowerCase().includes(q)
      );
    });
  }, [questions, search]);

  const groups = useMemo(() => groupByReport(filtered), [filtered]);
  const totalReports = groups.length;

  return (
    <div style={{ paddingBottom: 80 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>Questions Bank</h2>
          <p style={{ fontSize: 11, color: '#5A6080', marginTop: 2 }}>
            Manual questions raised against missing metrics, grouped by report
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#4040C8',
              background: 'rgba(64,64,200,.08)',
              padding: '5px 10px',
              borderRadius: 999,
            }}
          >
            {questions.length} {questions.length === 1 ? 'question' : 'questions'} · {totalReports}{' '}
            {totalReports === 1 ? 'report' : 'reports'}
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search question, indicator, period…"
            style={{
              fontSize: 12,
              padding: '7px 12px',
              borderRadius: 8,
              border: '1px solid #E2E4F0',
              outline: 'none',
              minWidth: 260,
              fontFamily: 'inherit',
              color: '#1A1D2E',
              background: '#fff',
            }}
          />
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: '#9BA3C4', fontSize: 12 }}>
          <div className="proc-ring" style={{ margin: '0 auto 10px', width: 28, height: 28, borderWidth: 2 }} />
          Loading questions…
        </div>
      ) : error ? (
        <div className="card" style={{ padding: 24, color: '#DC2626', fontSize: 12, textAlign: 'center' }}>
          {error}
        </div>
      ) : groups.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1D2E', marginBottom: 4 }}>
            No questions yet
          </div>
          <div style={{ fontSize: 11, color: '#9BA3C4' }}>
            {search
              ? 'No questions match your search.'
              : 'Open a report and click any missing metric to raise a question.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {groups.map((g) => (
            <ReportSection key={g.reportId} group={g} />
          ))}
        </div>
      )}
    </div>
  );
}

export default QuestionsPage;
