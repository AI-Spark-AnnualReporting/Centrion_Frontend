import { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle2, Loader2, Circle } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { quarterlyReports } from '@/lib/api';
import type {
  QuarterlyPreviewReport,
  PreviewSection,
  PreviewNarrativeSection,
  PreviewTablesSection,
  PreviewSentence,
  PreviewTableRow,
  ChangeDirection,
} from '@/types/quarterly';
import { QuarterlyReportStepper } from '@/components/quarterly/QuarterlyReportStepper';

// ─── colours (matches Coverage / Gaps conventions) ───────────────────────────
const ACCENT = '#4040C8';
const ACCENT_LIGHT = 'rgba(64,64,200,.07)';
const ACCENT_RING = 'rgba(64,64,200,.30)';
const GREEN = '#10B981';
const RED = '#EF4444';
const AMBER = '#D97706';
const MUTED = '#6B7280';
const DARK = '#1F2340';
const MONO = "'DM Mono', 'Courier New', monospace";

const pad2 = (n: number) => String(n).padStart(2, '0');

// ─── Page shell ───────────────────────────────────────────────────────────────
function Shell({ reportId, children }: { reportId?: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100% - 48px)',
        background: '#fff',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {reportId && <QuarterlyReportStepper activeStep={6} reportId={reportId} />}
      {children}
    </div>
  );
}

// ─── Generating state (synchronous ~30–60s compose) ───────────────────────────
// The generate POST blocks until done, so there is no live backend feed. We ease
// a simulated progress through the four composing stages so the wait feels alive
// and the operator can watch the agent "work" — matching QuarterlyGeneratingScreen.
const COMPOSE_STEPS = [
  { label: 'Reading the figures', desc: 'Pulling extracted figures and comparatives' },
  { label: 'Matching drivers', desc: 'Linking each figure to its stated reason' },
  { label: 'Composing the narrative', desc: 'Writing each section, sentence by sentence' },
  { label: 'Flagging the gaps', desc: 'Marking movements with no recorded reason' },
] as const;

function GeneratingState({ slow, regenerate }: { slow: boolean; regenerate: boolean }) {
  // Eased progress toward a 95% ceiling — decelerates so it never feels stalled
  // and never "completes" before the real payload lands (the page then unmounts).
  const [progress, setProgress] = useState(6);
  useEffect(() => {
    const id = window.setInterval(() => {
      setProgress((p) => (p >= 95 ? 95 : p + Math.max(0.25, (95 - p) * 0.012)));
    }, 220);
    return () => window.clearInterval(id);
  }, []);

  const pct = Math.round(progress);
  const per = 100 / COMPOSE_STEPS.length;
  // Keep the final step "active" (spinning) until the report arrives.
  const activeIdx = Math.min(COMPOSE_STEPS.length - 1, Math.floor(progress / per));

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '22px 28px 28px', animation: 'fade-in .4s ease-out' }}>
      {/* Hero */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 16,
          padding: '28px 32px',
          marginBottom: 16,
          background: 'linear-gradient(135deg,#1B1E40 0%,#272C5C 55%,#343B73 100%)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: 32,
        }}
      >
        {/* soft moving sheen for a sense of activity */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(105deg,transparent 30%,rgba(95,200,232,.10) 50%,transparent 70%)',
            backgroundSize: '220% 100%',
            animation: 'sheen 3s linear infinite',
            pointerEvents: 'none',
          }}
        />
        <ProgressRing progress={pct} />
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.5px', color: '#7FB4FF', textTransform: 'uppercase', marginBottom: 6 }}>
            Quarterly Report · Preview
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, marginBottom: 8 }}>
            {regenerate ? 'Regenerating your report' : 'Composing your report'}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.72)', maxWidth: 560, lineHeight: 1.5 }}>
            The report agent is writing each section from your figures and drivers — usually 30–60 seconds.
          </div>
        </div>
      </div>

      {/* Step checklist */}
      <div className="card" style={{ padding: '6px 20px' }}>
        {COMPOSE_STEPS.map((step, i) => {
          const done = i < activeIdx;
          const active = i === activeIdx;
          return (
            <div
              key={step.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '16px 0',
                borderBottom: i < COMPOSE_STEPS.length - 1 ? '1px solid #ECEEF8' : 'none',
              }}
            >
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: done ? '#E7F7EF' : active ? '#EEEEFF' : '#F2F3FA',
                  transition: 'background .3s',
                }}
              >
                {done ? (
                  <CheckCircle2 className="h-5 w-5" style={{ color: GREEN }} aria-hidden />
                ) : active ? (
                  <Loader2 className="h-5 w-5 animate-spin" style={{ color: ACCENT }} aria-hidden />
                ) : (
                  <Circle className="h-4 w-4" style={{ color: '#C5C8DB' }} aria-hidden />
                )}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1D2E' }}>{step.label}</div>
                <div style={{ fontSize: 12, color: '#5A6080', marginTop: 1 }}>{step.desc}</div>
              </div>
              <ComposeBadge done={done} active={active} />
            </div>
          );
        })}
      </div>

      {slow && (
        <p style={{ fontSize: 12, color: MUTED, marginTop: 16, textAlign: 'center' }}>
          Still working — longer reports can take a little extra time.
        </p>
      )}
    </div>
  );
}

function ComposeBadge({ done, active }: { done: boolean; active: boolean }) {
  const cfg = done
    ? { label: 'Done', color: GREEN, bg: '#E7F7EF' }
    : active
      ? { label: 'In progress', color: ACCENT, bg: '#EEEEFF' }
      : { label: 'Pending', color: '#9BA3C4', bg: '#F2F3FA' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg, whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color }} />
      {cfg.label}
    </span>
  );
}

// Circular SVG progress indicator with a percentage label in the centre.
function ProgressRing({ progress }: { progress: number }) {
  const size = 120;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(100, Math.max(0, progress)) / 100);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id="qpr-ring" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5B8DEF" />
            <stop offset="100%" stopColor="#5FC8E8" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#qpr-ring)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset .4s ease' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>
          {progress}
          <span style={{ fontSize: 13, fontWeight: 700 }}>%</span>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', marginTop: -2 }}>Composing</div>
      </div>
    </div>
  );
}

// ─── Editable sentence (narrative) ────────────────────────────────────────────
function SentenceView({
  sentence,
  editing,
  saving,
  error,
  onStartEdit,
  onCancel,
  onSave,
}: {
  sentence: PreviewSentence;
  editing: boolean;
  saving: boolean;
  error: string | null;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: (text: string) => void;
}) {
  const [draft, setDraft] = useState(sentence.text);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Esc cancels without saving; the resulting blur must then be a no-op.
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (editing) {
      setDraft(sentence.text);
      cancelledRef.current = false;
      requestAnimationFrame(() => {
        const el = taRef.current;
        if (el) {
          el.focus();
          el.style.height = 'auto';
          el.style.height = `${el.scrollHeight}px`;
          el.setSelectionRange(el.value.length, el.value.length);
        }
      });
    }
  }, [editing, sentence.text]);

  if (editing) {
    return (
      <div style={{ marginBottom: 18 }}>
        <textarea
          ref={taRef}
          value={draft}
          disabled={saving}
          onChange={(e) => {
            setDraft(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onBlur={() => {
            if (cancelledRef.current || saving) return;
            const t = draft.trim();
            if (t && t !== sentence.text) onSave(t);
            else onCancel();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              cancelledRef.current = true;
              onCancel();
            } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              if (draft.trim()) onSave(draft.trim());
            }
          }}
          rows={2}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 8,
            border: `1.5px solid ${error ? '#FECACA' : ACCENT}`,
            fontSize: 14,
            lineHeight: 1.75,
            color: DARK,
            fontFamily: 'inherit',
            resize: 'none',
            outline: 'none',
            boxSizing: 'border-box',
            background: '#fff',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 11, color: '#9BA3C4' }}>
          {saving ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: ACCENT }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Saving…
            </span>
          ) : (
            <span>Blur or ⌘+Enter to save · Esc to cancel</span>
          )}
        </div>
        {error && <div style={{ marginTop: 4, fontSize: 12, color: RED }}>{error}</div>}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <p
        onClick={onStartEdit}
        title="Click to edit"
        style={{
          margin: 0,
          fontSize: 14,
          lineHeight: 1.75,
          color: '#2A2E47',
          cursor: 'text',
          borderRadius: 6,
          transition: 'background 0.12s',
          padding: '2px 4px',
          marginLeft: -4,
          display: 'inline',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = ACCENT_LIGHT)}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        {sentence.text}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
        {sentence.source_label && (
          <span
            title={sentence.figure_codes.join(', ') || undefined}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11,
              fontWeight: 600,
              color: ACCENT,
              background: ACCENT_LIGHT,
              padding: '2px 8px',
              borderRadius: 6,
              lineHeight: 1.4,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M6.5 9.5l3-3M5 8L3.5 9.5a2.1 2.1 0 003 3L8 11M11 8l1.5-1.5a2.1 2.1 0 00-3-3L8 5" stroke={ACCENT} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {sentence.source_label}
          </span>
        )}
        {sentence.edited && (
          <span style={{ fontSize: 10, color: MUTED, fontStyle: 'italic' }}>· edited</span>
        )}
      </div>
    </div>
  );
}

// ─── Change cell (tables) ─────────────────────────────────────────────────────
function changeColor(dir: ChangeDirection): string {
  if (dir === 'up') return GREEN;
  if (dir === 'down') return RED;
  return MUTED; // flat / null
}

function ChangeCell({ pct, dir }: { pct: number | null; dir: ChangeDirection }) {
  if (pct == null) return <span style={{ color: MUTED }}>—</span>;
  const color = changeColor(dir);
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '';
  return (
    <span style={{ color, fontFamily: MONO, fontWeight: 600 }}>
      {arrow} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ─── Tables section ───────────────────────────────────────────────────────────
const TH_STYLE: React.CSSProperties = {
  padding: '8px 10px',
  color: MUTED,
  fontWeight: 600,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

function TablesSection({ section }: { section: PreviewTablesSection }) {
  return (
    <>
      {section.tables.map((table, ti) => {
        // Drop the Prior / Change columns when no row in this table has data for
        // them — an all-"—" column is just noise.
        const showPrior = table.rows.some((r) => r.prior_display != null);
        const showChange = table.rows.some((r) => r.change_pct != null);
        return (
          <div key={`${table.statement}-${ti}`} style={{ marginBottom: 24 }}>
            {section.tables.length > 1 && (
              <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#374151' }}>{table.title}</h3>
            )}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid #E5E7EF` }}>
                  <th style={{ ...TH_STYLE, textAlign: 'left' }}>Metric</th>
                  <th style={{ ...TH_STYLE, textAlign: 'right' }}>Current</th>
                  {showPrior && <th style={{ ...TH_STYLE, textAlign: 'right' }}>Prior</th>}
                  {showChange && <th style={{ ...TH_STYLE, textAlign: 'right' }}>Change</th>}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row: PreviewTableRow, ri) => (
                  <tr key={`${row.code}-${ri}`} style={{ borderBottom: '1px solid #F1F2F6' }}>
                    <td style={{ padding: '9px 10px', color: DARK }}>{row.label}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: MONO, color: DARK, fontWeight: 600 }}>{row.current_display}</td>
                    {showPrior && (
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: MONO, color: MUTED }}>{row.prior_display ?? '—'}</td>
                    )}
                    {showChange && (
                      <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                        <ChangeCell pct={row.change_pct} dir={row.change_direction} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}

// ─── One section (narrative or tables) ────────────────────────────────────────
function SectionView({
  section,
  registerRef,
  editingId,
  savingId,
  sentenceError,
  onStartEdit,
  onCancelEdit,
  onSaveSentence,
}: {
  section: PreviewSection;
  registerRef: (el: HTMLElement | null) => void;
  editingId: string | null;
  savingId: string | null;
  sentenceError: string | null;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaveSentence: (section: PreviewNarrativeSection, sentence: PreviewSentence, text: string) => void;
}) {
  return (
    <section ref={registerRef} data-section-id={section.id} style={{ marginBottom: 40, scrollMarginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: '#fff', background: ACCENT, padding: '3px 7px', borderRadius: 6 }}>
          {pad2(section.number)}
        </span>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: DARK }}>{section.title}</h2>
      </div>

      {section.type === 'tables' ? (
        <TablesSection section={section} />
      ) : (
        section.sentences.map((s) => (
          <SentenceView
            key={s.id}
            sentence={s}
            editing={editingId === s.id}
            saving={savingId === s.id}
            error={editingId === s.id ? sentenceError : null}
            onStartEdit={() => onStartEdit(s.id)}
            onCancel={onCancelEdit}
            onSave={(text) => onSaveSentence(section, s, text)}
          />
        ))
      )}
    </section>
  );
}

// ─── Sections rail (left nav + driver counts) ─────────────────────────────────
function SectionsRail({
  report,
  activeId,
  onJump,
}: {
  report: QuarterlyPreviewReport;
  activeId: string | null;
  onJump: (id: string) => void;
}) {
  return (
    <div className="card" style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', minHeight: 0, alignSelf: 'start', position: 'sticky', top: 0 }}>
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: MUTED, textTransform: 'uppercase', marginBottom: 12, paddingLeft: 4 }}>
        Sections
      </span>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {report.sections.map((s) => {
          const active = s.id === activeId;
          return (
            <button
              key={s.id}
              onClick={() => onJump(s.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 8,
                border: active ? `1.5px solid ${ACCENT_RING}` : '1.5px solid transparent',
                background: active ? ACCENT_LIGHT : 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.12s, border-color 0.12s',
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: active ? ACCENT : MUTED, flexShrink: 0 }}>
                {pad2(s.number)}
              </span>
              <span style={{ fontSize: 12.5, fontWeight: active ? 700 : 500, color: active ? DARK : '#374151', lineHeight: 1.35 }}>
                {s.title}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ borderTop: '1px solid #ECEEF8', marginTop: 14, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <CountRow label="Drivers from docs" value={report.driver_summary.from_docs} color={ACCENT} />
        <CountRow label="Drivers you added" value={report.driver_summary.user_added} color={GREEN} />
        <CountRow label="Flagged · no reason" value={report.driver_summary.flagged_no_reason} color={AMBER} />
      </div>

      <div style={{ marginTop: 12, paddingLeft: 4, fontSize: 11, color: '#9BA3C4', fontFamily: MONO }}>
        {report.word_count.toLocaleString()} words
      </div>
    </div>
  );
}

function CountRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
      <span style={{ fontSize: 11.5, color: color === AMBER ? AMBER : MUTED, fontWeight: color === AMBER ? 600 : 500 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: MONO }}>{value}</span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function QuarterlyPreviewPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;

  const [report, setReport] = useState<QuarterlyPreviewReport | null>(null);
  const [phase, setPhase] = useState<'loading' | 'generating' | 'ready' | 'failed'>('loading');
  const [isRegenerate, setIsRegenerate] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // inline-edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sentenceError, setSentenceError] = useState<string | null>(null);

  // section scroll/highlight
  const [activeId, setActiveId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  // ── download (PDF / DOCX) ──
  const [menuOpen, setMenuOpen] = useState(false);
  const [downloading, setDownloading] = useState<null | 'pdf' | 'docx'>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const downloadRef = useRef<HTMLDivElement>(null);

  // Close the format menu when clicking outside it.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (downloadRef.current && !downloadRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const handleDownload = async (fmt: 'pdf' | 'docx') => {
    if (!companyId || !reportId) return;
    setMenuOpen(false);
    setDownloadError(null);
    setDownloading(fmt);
    try {
      await quarterlyReports.downloadExport(companyId, reportId, fmt, report?.header.title);
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : 'Download failed.');
    } finally {
      setDownloading(null);
    }
  };

  // ── on entering Preview: GET (cheap); generate only if never generated ──
  useEffect(() => {
    if (!companyId || !reportId) return;
    let cancelled = false;
    let slowTimer: number | undefined;

    setPhase('loading');
    setError(null);
    setSlow(false);
    setIsRegenerate(false);

    const onReady = (r: QuarterlyPreviewReport) => {
      if (cancelled) return;
      setReport(r);
      setPhase('ready');
      setActiveId((prev) => prev ?? r.sections[0]?.id ?? null);
    };

    quarterlyReports
      .getPreview(companyId, reportId)
      .then((res) => {
        if (cancelled) return;
        if (res.generated) {
          onReady(res);
          return;
        }
        // Never generated — compose now (synchronous ~30–60s).
        setPhase('generating');
        slowTimer = window.setTimeout(() => !cancelled && setSlow(true), 45000);
        return quarterlyReports.generatePreview(companyId, reportId).then(onReady);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPhase('failed');
        setError(err instanceof Error ? err.message : 'Failed to load the report preview.');
      });

    return () => {
      cancelled = true;
      if (slowTimer) window.clearTimeout(slowTimer);
    };
  }, [companyId, reportId, retryKey]);

  // ── scrollspy ──
  useEffect(() => {
    if (phase !== 'ready') return;
    const root = scrollRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          const id = (visible[0].target as HTMLElement).dataset.sectionId;
          if (id) setActiveId(id);
        }
      },
      { root, rootMargin: '0px 0px -65% 0px', threshold: 0.01 },
    );
    sectionRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [phase, report]);

  const handleJump = useCallback((id: string) => {
    setActiveId(id);
    sectionRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // ── regenerate (overwrites, discards edits) ──
  const handleRegenerate = useCallback(() => {
    if (!companyId || !reportId) return;
    if (!window.confirm('Regenerate this report? Any inline edits you made will be discarded.')) return;
    setIsRegenerate(true);
    setPhase('generating');
    setSlow(false);
    setError(null);
    const slowTimer = window.setTimeout(() => setSlow(true), 45000);
    quarterlyReports
      .generatePreview(companyId, reportId)
      .then((r) => {
        window.clearTimeout(slowTimer);
        setReport(r);
        setPhase('ready');
        setActiveId(r.sections[0]?.id ?? null);
      })
      .catch((err: unknown) => {
        window.clearTimeout(slowTimer);
        setPhase('failed');
        setError(err instanceof Error ? err.message : 'Failed to regenerate the report.');
      });
  }, [companyId, reportId]);

  // ── inline-edit save (optimistic; reverts on failure) ──
  const handleSaveSentence = useCallback(
    async (section: PreviewNarrativeSection, sentence: PreviewSentence, text: string) => {
      if (!companyId || !reportId) return;
      const prevText = sentence.text;
      const prevEdited = sentence.edited;
      setSavingId(sentence.id);
      setSentenceError(null);
      setReport((r) => patchSentence(r, sentence.id, { text, edited: true }));
      try {
        const res = await quarterlyReports.updatePreviewSentence(companyId, reportId, {
          section_id: section.id,
          sentence_id: sentence.id,
          text,
        });
        setReport((r) => {
          const next = patchSentence(r, sentence.id, res.sentence);
          return next ? { ...next, word_count: res.word_count } : next;
        });
        setEditingId(null);
      } catch (err) {
        setReport((r) => patchSentence(r, sentence.id, { text: prevText, edited: prevEdited }));
        const msg =
          err instanceof Error && /422/.test(err.message)
            ? 'A sentence can’t be empty.'
            : err instanceof Error
              ? err.message
              : 'Could not save the edit.';
        setSentenceError(msg);
      } finally {
        setSavingId(null);
      }
    },
    [companyId, reportId],
  );

  // ── loading (cheap GET) ──
  if (phase === 'loading') {
    return (
      <Shell reportId={reportId}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.9s linear infinite' }}>
            <circle cx="12" cy="12" r="10" stroke={ACCENT} strokeWidth="3" strokeOpacity="0.2" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
      </Shell>
    );
  }

  // ── generating (synchronous compose) ──
  if (phase === 'generating') {
    return (
      <Shell reportId={reportId}>
        <GeneratingState slow={slow} regenerate={isRegenerate} />
      </Shell>
    );
  }

  // ── failed ──
  if (phase === 'failed' || !report) {
    return (
      <Shell reportId={reportId}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 30, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: DARK, margin: '0 0 8px' }}>
            We couldn’t compose the report
          </h2>
          <p style={{ fontSize: 13, color: MUTED, margin: '0 0 22px', maxWidth: 420 }}>
            {error ?? 'Something went wrong while generating the preview.'}
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn bs" style={{ padding: '9px 18px', fontSize: 13 }} onClick={() => navigate(`/quarterly-report/${reportId}/gaps`)}>
              ← Back to gaps
            </button>
            <button className="btn bp" style={{ padding: '9px 18px', fontSize: 13 }} onClick={() => setRetryKey((k) => k + 1)}>
              Try again
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ── ready ──
  const { header } = report;
  return (
    <Shell reportId={reportId}>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: '220px 1fr',
          gap: 18,
          padding: '20px 28px 16px',
          alignItems: 'stretch',
        }}
      >
        {/* LEFT — sections rail */}
        <SectionsRail report={report} activeId={activeId} onJump={handleJump} />

        {/* RIGHT — the document (scrolls internally) */}
        <div ref={scrollRef} style={{ minHeight: 0, overflowY: 'auto', paddingRight: 6 }}>
          <div className="card" style={{ padding: '28px 36px', maxWidth: 760 }}>
            {/* Document header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 6 }}>
              <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, color: DARK, lineHeight: 1.2, fontFamily: "'Fraunces', Georgia, serif" }}>
                {header.title}
              </h1>
              <button
                className="btn bs"
                onClick={handleRegenerate}
                title="Regenerate (discards inline edits)"
                style={{ flexShrink: 0, fontSize: 12, padding: '7px 12px', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M13 8a5 5 0 1 1-1.5-3.5M13 2v3h-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Regenerate
              </button>
            </div>
            <p style={{ margin: '0 0 22px', fontSize: 13, color: MUTED }}>{header.subtitle}</p>
            <div style={{ borderTop: `2px solid ${DARK}`, marginBottom: 26 }} />

            {/* Sections */}
            {report.sections.map((s) => (
              <SectionView
                key={s.id}
                section={s}
                registerRef={(el) => {
                  if (el) sectionRefs.current.set(s.id, el);
                  else sectionRefs.current.delete(s.id);
                }}
                editingId={editingId}
                savingId={savingId}
                sentenceError={sentenceError}
                onStartEdit={(id) => {
                  setSentenceError(null);
                  setEditingId(id);
                }}
                onCancelEdit={() => {
                  setSentenceError(null);
                  setEditingId(null);
                }}
                onSaveSentence={handleSaveSentence}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ flexShrink: 0, background: '#fff', borderTop: '1px solid #E5E7EF', padding: '12px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <button className="btn bs" style={{ fontSize: 13, padding: '10px 18px' }} onClick={() => navigate(`/quarterly-report/${reportId}/gaps`)}>
          ← Back
        </button>

        <span style={{ fontSize: 12, color: MUTED, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3L11 2.5z" stroke={MUTED} strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
          Click any sentence to edit inline
        </span>

        <div ref={downloadRef} style={{ position: 'relative' }}>
          {downloadError && (
            <div
              style={{
                position: 'absolute', bottom: 'calc(100% + 8px)', right: 0,
                background: '#FEF2F2', border: `1px solid ${RED}`, color: RED,
                borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 600,
                maxWidth: 260, zIndex: 20,
              }}
            >
              {downloadError}
            </div>
          )}

          <button
            className="bp"
            style={{ fontSize: 14, padding: '10px 24px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}
            disabled={!!downloading || !companyId || !reportId}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {downloading ? 'Preparing…' : 'Download'}
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {menuOpen && !downloading && (
            <div
              style={{
                position: 'absolute', bottom: 'calc(100% + 8px)', right: 0,
                background: '#fff', border: '1px solid #E5E7EF', borderRadius: 10,
                boxShadow: '0 8px 24px rgba(31,35,64,.14)', padding: 6, minWidth: 180, zIndex: 20,
              }}
            >
              {([
                { fmt: 'pdf' as const, label: 'PDF' },
                { fmt: 'docx' as const, label: 'Word (.docx)' },
              ]).map((opt) => (
                <button
                  key={opt.fmt}
                  onClick={() => handleDownload(opt.fmt)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '9px 12px', fontSize: 13, fontWeight: 600, color: DARK,
                    background: 'transparent', border: 'none', borderRadius: 7,
                    cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = ACCENT_LIGHT)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                    <path d="M6 1.5v6m0 0L3.5 5m2.5 2.5L8.5 5M2 9.5h8" stroke={ACCENT} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function patchSentence(
  report: QuarterlyPreviewReport | null,
  sentenceId: string,
  patch: Partial<PreviewSentence>,
): QuarterlyPreviewReport | null {
  if (!report) return report;
  return {
    ...report,
    sections: report.sections.map((s) =>
      s.type === 'narrative'
        ? { ...s, sentences: s.sentences.map((x) => (x.id === sentenceId ? { ...x, ...patch } : x)) }
        : s,
    ),
  };
}
