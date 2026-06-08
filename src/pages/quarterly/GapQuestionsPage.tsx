import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { quarterlyReports } from '@/lib/api';
import type { GapItem, GapsResponse } from '@/types/quarterly';
import { QuarterlyReportStepper } from '@/components/quarterly/QuarterlyReportStepper';

// ─── colours (matches CoverageMapPage conventions) ────────────────────────────
const ACCENT = '#4040C8';
const ACCENT_LIGHT = 'rgba(64,64,200,.07)';
const ACCENT_RING = 'rgba(64,64,200,.35)';
const GREEN = '#10B981';
const GREEN_LIGHT = '#D1FAE5';
const RED = '#EF4444';
const MUTED = '#6B7280';
const MONO = "'DM Mono', 'Courier New', monospace";

// ─── per-gap working state ────────────────────────────────────────────────────
interface GapState extends GapItem {
  answer: string;
  skipped: boolean;
}

function seedGaps(raw: GapItem[]): GapState[] {
  return raw.map((g) => ({
    ...g,
    answer: g.current_answer ?? '',
    skipped: false,
  }));
}

function firstUnanswered(gaps: GapState[]): number {
  const idx = gaps.findIndex((g) => !g.answered);
  return idx === -1 ? 0 : idx;
}

function goToNextUnanswered(gaps: GapState[], from: number): number {
  for (let i = from + 1; i < gaps.length; i++) {
    if (!gaps[i].answered) return i;
  }
  // No unanswered after current — try to stay or move to last
  return Math.min(from + 1, gaps.length - 1);
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function Skel({ w, h }: { w: string | number; h?: number }) {
  return (
    <div
      className="skel"
      style={{ width: w, height: h ?? 14, borderRadius: 6, display: 'inline-block' }}
    />
  );
}

function LoadingState() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, padding: '0 28px 16px' }}>
      {/* Rail skeleton */}
      <div className="card" style={{ padding: '16px 14px' }}>
        <div style={{ marginBottom: 14 }}><Skel w="60%" h={12} /></div>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center' }}>
            <Skel w={22} h={22} />
            <div style={{ flex: 1 }}><Skel w="80%" /></div>
          </div>
        ))}
      </div>
      {/* Card skeleton */}
      <div className="card" style={{ padding: '22px 24px', alignSelf: 'start' }}>
        <div style={{ marginBottom: 16 }}><Skel w="40%" h={12} /></div>
        <div className="card" style={{ padding: '16px', marginBottom: 20, background: '#F8F9FC' }}>
          <Skel w="50%" h={14} />
          <div style={{ marginTop: 10 }}><Skel w="60%" h={28} /></div>
        </div>
        <Skel w="90%" h={14} />
        <div style={{ marginTop: 16 }}><Skel w="100%" h={80} /></div>
      </div>
    </div>
  );
}

// ─── Change badge (unit-agnostic) ─────────────────────────────────────────────
function ChangeBadge({
  pct,
  direction,
  display,
}: {
  pct: number | null;
  direction: 'up' | 'down' | null;
  display?: string | null;
}) {
  if (pct == null && !display) return <span style={{ color: MUTED }}>—</span>;
  const up = direction === 'up';
  const text = display ?? `${Math.abs(pct ?? 0).toFixed(1)}%`;
  return (
    <span style={{ color: up ? GREEN : RED, fontFamily: MONO, fontSize: 13, fontWeight: 600 }}>
      {up ? '▲' : '▼'} {text}
    </span>
  );
}

// ─── Rail item ────────────────────────────────────────────────────────────────
function RailItem({
  gap,
  index,
  isCurrent,
  onClick,
}: {
  gap: GapState;
  index: number;
  isCurrent: boolean;
  onClick: () => void;
}) {
  const up = gap.change_direction === 'up';
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        borderRadius: 8,
        cursor: 'pointer',
        background: isCurrent ? ACCENT_LIGHT : 'transparent',
        border: isCurrent ? `1.5px solid ${ACCENT_RING}` : '1.5px solid transparent',
        opacity: gap.skipped && !isCurrent ? 0.55 : 1,
        transition: 'background 0.15s, border-color 0.15s',
        marginBottom: 2,
      }}
    >
      {/* Badge: check / number */}
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 700,
          background: gap.answered ? GREEN_LIGHT : isCurrent ? ACCENT : '#F1F2F6',
          color: gap.answered ? GREEN : isCurrent ? '#fff' : MUTED,
          border: `1px solid ${gap.answered ? '#A7F3D0' : isCurrent ? ACCENT : '#E5E7EF'}`,
        }}
      >
        {gap.answered ? (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6.2L5 8.7l4.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          String(index + 1)
        )}
      </div>

      {/* Label */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: isCurrent ? 700 : 500,
            color: isCurrent ? '#1F2340' : '#374151',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {gap.label}
        </div>
      </div>

      {/* Change pct */}
      <span style={{ fontSize: 11, fontFamily: MONO, color: up ? GREEN : RED, flexShrink: 0 }}>
        {gap.change_display ?? (gap.change_pct != null ? `${Math.abs(gap.change_pct).toFixed(1)}%` : '—')}
      </span>
    </div>
  );
}

// ─── Page shell (stepper + bounded flex column) ───────────────────────────────
function Shell({ reportId, children }: { reportId?: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#fff',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {reportId && <QuarterlyReportStepper activeStep={5} reportId={reportId} />}
      {children}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function GapQuestionsPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;

  // ── fetch state
  const [gaps, setGaps] = useState<GapState[]>([]);
  const [meta, setMeta] = useState<Pick<GapsResponse, 'period_label' | 'prior_period_label' | 'total_gaps'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // ── navigation state
  const [currentIndex, setCurrentIndex] = useState(0);

  // ── save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── textarea ref for focus management
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!companyId || !reportId) return;
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    quarterlyReports
      .getGaps(companyId, reportId)
      .then((res) => {
        if (cancelled) return;
        const seeded = seedGaps(res.gaps);
        setGaps(seeded);
        setMeta({ period_label: res.period_label, prior_period_label: res.prior_period_label, total_gaps: res.total_gaps });
        setCurrentIndex(firstUnanswered(seeded));
      })
      .catch((err: unknown) => {
        if (!cancelled) setFetchError(err instanceof Error ? err.message : 'Failed to load gaps.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [companyId, reportId, retryKey]);

  // Focus textarea whenever current gap changes
  useEffect(() => {
    textareaRef.current?.focus();
  }, [currentIndex]);

  const answeredCount = gaps.filter((g) => g.answered).length;
  const total = gaps.length;
  const gap = gaps[currentIndex] ?? null;

  // ── update answer text for current gap
  const setAnswer = useCallback((text: string) => {
    setGaps((prev) => prev.map((g, i) => i === currentIndex ? { ...g, answer: text } : g));
    setSaveError(null);
  }, [currentIndex]);

  // ── save & advance
  const handleSave = useCallback(async () => {
    if (!gap || !companyId || !reportId) return;
    const text = gap.answer.trim();
    if (!text) return;
    setSaving(true);
    setSaveError(null);
    try {
      await quarterlyReports.addDriver(companyId, reportId, gap.figure_id, {
        text,
        source: 'user_provided',
      });
      setGaps((prev) => {
        const next = prev.map((g, i) =>
          i === currentIndex ? { ...g, answered: true, skipped: false } : g
        );
        setCurrentIndex(goToNextUnanswered(next, currentIndex));
        return next;
      });
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [gap, companyId, reportId, currentIndex]);

  // ── skip (no POST)
  const handleSkip = useCallback(() => {
    setGaps((prev) => prev.map((g, i) => i === currentIndex ? { ...g, skipped: true } : g));
    setSaveError(null);
    setCurrentIndex((i) => Math.min(i + 1, total - 1));
  }, [currentIndex, total]);

  // ── keyboard shortcut ⌘/Ctrl+Enter
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave],
  );

  // ── loading
  if (loading) {
    return (
      <Shell reportId={reportId}>
        <div style={{ padding: '24px 28px 18px' }}>
          <Skel w={220} h={22} />
          <div style={{ marginTop: 8 }}><Skel w={360} h={12} /></div>
        </div>
        <LoadingState />
      </Shell>
    );
  }

  // ── fetch error
  if (fetchError) {
    return (
      <Shell reportId={reportId}>
        <div style={{ padding: '24px 28px' }}>
          <div style={{ padding: '16px 20px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ fontSize: 13, color: '#DC2626' }}>{fetchError}</span>
            <button className="bs" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => setRetryKey((k) => k + 1)}>
              Retry
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ── no gaps (all covered)
  if (total === 0) {
    return (
      <Shell reportId={reportId}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 14 }}>✓</div>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: '#1F2340', margin: '0 0 8px' }}>
            No missing reasons — every material figure already has one
          </h2>
          <p style={{ fontSize: 13, color: MUTED, marginBottom: 24 }}>
            The Coverage Map found drivers for all extracted figures.
          </p>
          <button className="bp" onClick={() => navigate(`/quarterly-report/${reportId}/preview`)}>
            Continue to preview →
          </button>
        </div>
      </Shell>
    );
  }

  const allAnswered = answeredCount === total;

  return (
    <Shell reportId={reportId}>
      {/* Page header — fixed (does not scroll) */}
      <div style={{ padding: '22px 28px 16px', flexShrink: 0 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1F2340', margin: '0 0 4px', lineHeight: 1.2 }}>
          Targeted questions
        </h1>
        <p style={{ margin: 0, fontSize: 12, color: MUTED }}>
          We only ask where a reason was missing. Short, specific answers — no broad surveys.
        </p>
      </div>

      {/* Two-column body — fills remaining height; rail scrolls internally */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: '280px 1fr',
          gap: 16,
          padding: '0 28px 16px',
          alignItems: 'stretch',
        }}
      >
        {/* ── LEFT RAIL ── */}
        <div
          className="card"
          style={{
            padding: '14px 10px 10px',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* Rail header — fixed */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '0 6px', flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: MUTED, textTransform: 'uppercase' }}>
              Gaps
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: allAnswered ? GREEN : ACCENT,
                fontFamily: MONO,
                background: allAnswered ? GREEN_LIGHT : ACCENT_LIGHT,
                padding: '2px 8px',
                borderRadius: 10,
              }}
            >
              {answeredCount}/{total}
            </span>
          </div>

          {/* Scrollable gap list */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 2 }}>
            {gaps.map((g, i) => (
              <RailItem
                key={g.figure_id}
                gap={g}
                index={i}
                isCurrent={i === currentIndex}
                onClick={() => {
                  setSaveError(null);
                  setCurrentIndex(i);
                }}
              />
            ))}
          </div>
        </div>

        {/* ── RIGHT COLUMN (scrolls if card is tall) ── */}
        <div style={{ minHeight: 0, overflowY: 'auto' }}>
          {gap && (
            <div className="card" style={{ padding: '22px 24px' }}>
              {/* Top row: statement pill + counter + code */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(64,64,200,.08)', color: ACCENT, textTransform: 'capitalize' }}>
                  • {gap.statement.replace(/_/g, ' ')}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: MUTED }}>
                    Question {currentIndex + 1} of {total}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: ACCENT }}>
                    {gap.code}
                  </span>
                </div>
              </div>

              {/* Figure block */}
              <div style={{ background: '#F8F9FC', border: '1px solid #ECEEF8', borderRadius: 10, padding: '16px 18px', marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: MUTED, marginBottom: 6, fontWeight: 600 }}>
                  {gap.label}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: '#1F2340', lineHeight: 1 }}>
                    {gap.current_display}
                  </span>
                  <ChangeBadge pct={gap.change_pct} direction={gap.change_direction} display={gap.change_display} />
                  {gap.prior_display && meta && (
                    <span style={{ fontSize: 12, color: MUTED }}>
                      vs {gap.prior_display} in {meta.prior_period_label}
                    </span>
                  )}
                </div>
              </div>

              {/* Question row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
                <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 6, background: ACCENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, marginTop: 1 }}>
                  ✦
                </span>
                <p style={{ margin: 0, fontSize: 14, color: '#1F2340', lineHeight: 1.6 }}>
                  {gap.question}
                </p>
              </div>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={gap.answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={gap.placeholder}
                rows={4}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: `1.5px solid ${saveError ? '#FECACA' : '#E5E7EF'}`,
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: '#1F2340',
                  background: '#fff',
                  resize: 'vertical',
                  outline: 'none',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s',
                }}
                onFocus={(e) => { if (!saveError) e.target.style.borderColor = ACCENT; }}
                onBlur={(e) => { if (!saveError) e.target.style.borderColor = '#E5E7EF'; }}
              />

              {/* Save error */}
              {saveError && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#DC2626' }}>
                  {saveError}
                </div>
              )}

              {/* Actions row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, gap: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={handleSkip}
                  style={{ background: 'none', border: 'none', fontSize: 13, color: MUTED, cursor: 'pointer', padding: 0, textDecoration: 'underline', textUnderlineOffset: 2 }}
                >
                  Skip for now
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 11, color: MUTED }}>⌘+Enter to save &amp; continue</span>
                  <button
                    className="bp"
                    onClick={handleSave}
                    disabled={saving || !gap.answer.trim()}
                    style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, opacity: saving || !gap.answer.trim() ? 0.55 : 1 }}
                  >
                    {saving && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                    )}
                    Save &amp; next →
                  </button>
                </div>
              </div>

              {/* Footnote */}
              <p style={{ margin: '18px 0 0', fontSize: 11, color: '#9BA3C4', lineHeight: 1.5 }}>
                ⓘ We never invent a reason. Anything you skip is flagged in the report rather than filled in.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer bar — fixed at bottom */}
      <div style={{ flexShrink: 0, background: '#fff', borderTop: '1px solid #E5E7EF', padding: '10px 200px 10px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <button className="bs" style={{ fontSize: 13 }} onClick={() => navigate(`/quarterly-report/${reportId}/coverage`)}>
          ← Back to coverage
        </button>

        <span style={{ fontSize: 13, color: allAnswered ? GREEN : MUTED, fontWeight: 600 }}>
          {answeredCount} of {total} answered
        </span>

        <button
          className="bp"
          style={{ fontSize: 14, padding: '10px 24px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}
          onClick={() => navigate(`/quarterly-report/${reportId}/preview`)}
        >
          {allAnswered ? 'Continue' : `Continue with ${answeredCount} answered`}
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path d="M8 4l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </Shell>
  );
}
