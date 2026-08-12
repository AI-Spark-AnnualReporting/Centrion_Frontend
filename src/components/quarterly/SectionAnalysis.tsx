import { useCallback, useEffect, useRef, useState } from 'react';
import { quarterlyReports } from '@/lib/api';
import type { ProducedSection, SectionAnalysis as Analysis } from '@/types/quarterly';
import { Prose } from './SectionContent';
import { tableRowCount } from './sectionState';

const ACCENT = '#4040C8';
const DARK = '#1A1D2E';
const MUTED = '#6B7280';
const LINE = '#ECEEF8';
const AMBER = '#B45309';
const RED = '#DC2626';

// The figures leave the building, so the wait is worth bounding: request() has no
// timeout of its own and would otherwise hang for as long as the browser allows.
const TIMEOUT_MS = 90_000;
const SLOW_AFTER_MS = 20_000;

function figureCount(section: ProducedSection): number {
  try {
    return tableRowCount(JSON.parse(section.content ?? ''));
  } catch {
    return 0;
  }
}

function whenLabel(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ── Consent before the figures go anywhere ───────────────────────────────────
// Shell mirrors ApproveConfirmDialog, the house convention for confirming a
// server action. Focus handling is the one addition: no dialog in this app traps
// focus, and a consent dialog is where that matters.
function ConfirmDialog({
  title, lines, redo, busy, onConfirm, onClose,
}: {
  title: string;
  lines: number;
  redo: boolean;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnTo.current = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => returnTo.current?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Analyse this section?"
      onClick={busy ? undefined : onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1400,
        background: 'rgba(20,22,40,.45)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        animation: 'fade-in .2s ease-out',
      }}
    >
      <div
        className="analysis-pop"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(460px, 100%)', background: '#fff', borderRadius: 16,
          boxShadow: '0 24px 60px rgba(20,22,40,.28)', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '20px 22px 4px' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: DARK }}>
            {redo ? 'Write this analysis again?' : 'Analyse this section?'}
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
            This sends the <strong>{lines} {lines === 1 ? 'line' : 'lines'}</strong> of figures in{' '}
            <strong>{title}</strong> to OpenAI to be read and summarised. Nothing else from your
            report is sent.
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
            {redo
              ? 'The paragraphs below will be replaced, including any edits you have made.'
              : 'The two paragraphs it writes are printed under this table in the report you export.'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '18px 22px' }}>
          <button
            ref={cancelRef}
            type="button"
            className="btn bs"
            onClick={onClose}
            disabled={busy}
            style={{ fontSize: 13, padding: '9px 18px' }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn bp"
            onClick={onConfirm}
            disabled={busy}
            style={{ fontSize: 13, padding: '10px 22px', opacity: busy ? 0.6 : 1 }}
          >
            {redo ? 'Write it again' : 'Analyse'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Beat one: reading ────────────────────────────────────────────────────────
// No fabricated stage cycling — the client cannot know which stage the server is
// in. The line states the true scope; the band over the table carries the motion.
function Reading({ lines, slow }: { lines: number; slow: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex', alignItems: 'center', gap: 9,
        fontSize: 12.5, fontWeight: 600, color: ACCENT,
      }}
    >
      <span style={{ display: 'inline-flex', gap: 3 }} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 5, height: 5, borderRadius: '50%', background: ACCENT,
              animation: `pdot .9s ${i * 0.15}s infinite`,
            }}
          />
        ))}
      </span>
      Reading {lines} {lines === 1 ? 'line' : 'lines'} from this table
      {slow && <span style={{ color: MUTED, fontWeight: 500 }}>· still working</span>}
    </div>
  );
}

// ── The whole control ────────────────────────────────────────────────────────
export default function SectionAnalysis({
  companyId, reportId, section, onBusyChange, onAnalysis,
}: {
  companyId: string;
  reportId: string;
  section: ProducedSection;
  // Lets the Preview dim the table and paint the reading band over it — the band
  // must sit outside the table's own overflow scroller to avoid being clipped.
  onBusyChange?: (busy: boolean) => void;
  onAnalysis?: (a: Analysis | null) => void;
}) {
  const [analysis, setAnalysis] = useState<Analysis | null>(section.analysis ?? null);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  // Only animate the arrival, not every re-render.
  const [arrived, setArrived] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const notifyBusy = useRef(onBusyChange);
  notifyBusy.current = onBusyChange;
  useEffect(() => {
    notifyBusy.current?.(busy);
    return () => notifyBusy.current?.(false);
  }, [busy]);

  const notifyAnalysis = useRef(onAnalysis);
  notifyAnalysis.current = onAnalysis;
  useEffect(() => {
    notifyAnalysis.current?.(analysis);
  }, [analysis]);

  // An analysis describes the numbers as they were. If the table is edited after,
  // the prose is stale — say so rather than letting it read as current. Seeded at
  // mount, so this also catches an edit made to a stored analysis's table.
  const contentAtRun = useRef<string | null>(section.content ?? null);
  const stale = analysis != null && contentAtRun.current !== (section.content ?? null);

  const lines = figureCount(section);

  const run = useCallback(async (force: boolean) => {
    setConfirming(false);
    setBusy(true);
    setSlow(false);
    setError(null);
    setArrived(false);

    const controller = new AbortController();
    abortRef.current = controller;
    const slowTimer = window.setTimeout(() => mounted.current && setSlow(true), SLOW_AFTER_MS);
    const killTimer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await quarterlyReports.analyseSection(companyId, reportId, section.section_code, {
        force, signal: controller.signal,
      });
      if (!mounted.current) return;
      contentAtRun.current = section.content ?? null;
      setAnalysis(res);
      setArrived(true);
    } catch (err: unknown) {
      if (!mounted.current) return;
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      setError(aborted
        ? 'That took too long. Please try again.'
        : err instanceof Error ? err.message : 'The analysis could not be written.');
    } finally {
      window.clearTimeout(slowTimer);
      window.clearTimeout(killTimer);
      if (mounted.current) {
        setBusy(false);
        setSlow(false);
      }
    }
  }, [companyId, reportId, section.section_code, section.content]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await quarterlyReports.saveSectionAnalysis(
        companyId, reportId, section.section_code, draft,
      );
      if (!mounted.current) return;
      setAnalysis(draft.trim() ? res : null);
      setEditing(false);
    } catch (err: unknown) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : 'Could not save the analysis.');
      }
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, [companyId, reportId, section.section_code, draft]);

  // The arrival sequence: the rule draws, then the byline, then the prose behind
  // it. Applied only on a fresh result — a stored analysis is simply there.
  const beat = (cls: string, delayMs: number) => ({
    className: arrived ? cls : undefined,
    delay: arrived ? { animationDelay: `${delayMs}ms` } : undefined,
  });

  return (
    <div style={{ marginTop: 18 }}>
      {busy && <Reading lines={lines} slow={slow} />}

      {analysis && !busy && !editing && (
        <>
          <div
            className={beat('analysis-rule', 0).className}
            style={{
              height: 2, width: 46, borderRadius: 2, background: ACCENT, marginBottom: 12,
              transformOrigin: 'left center',
              ...beat('analysis-rule', 0).delay,
            }}
          />

          <div
            className={beat('analysis-rise', 180).className}
            style={{
              display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8,
              ...beat('analysis-rise', 180).delay,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: ACCENT, textTransform: 'uppercase' }}>
              Analysis
            </span>
            <span style={{ fontSize: 11, color: MUTED }}>
              {analysis.edited
                ? `Edited by you${analysis.edited_at ? ` · ${whenLabel(analysis.edited_at)}` : ''}`
                : `${analysis.model ?? 'AI'}${analysis.generated_at ? ` · ${whenLabel(analysis.generated_at)}` : ''}`}
            </span>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 14 }}>
              <button
                type="button"
                onClick={() => { setDraft(analysis.text); setEditing(true); }}
                style={linkBtn}
              >
                Edit
              </button>
              <button type="button" onClick={() => setConfirming(true)} style={linkBtn}>
                Re-analyse
              </button>
            </span>
          </div>

          {stale && (
            <div style={{ marginBottom: 8, fontSize: 12, color: AMBER }}>
              The figures changed after this was written. Re-analyse for an up-to-date read.
            </div>
          )}

          <div
            className={beat('analysis-rise', 300).className}
            style={beat('analysis-rise', 300).delay}
          >
            <Prose text={analysis.text} />
          </div>

          {!!analysis.warnings?.length && (
            <div style={{ marginTop: 10, fontSize: 11.5, color: AMBER }}>
              Check these against the table — {analysis.warnings.join('; ')}
            </div>
          )}
        </>
      )}

      {editing && (
        <>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: ACCENT, textTransform: 'uppercase', marginBottom: 8 }}>
            Analysis
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            autoFocus
            aria-label={`Analysis for ${section.title}`}
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 10,
              border: `1.5px solid ${ACCENT}`, fontFamily: 'inherit',
              fontSize: 14, lineHeight: 1.75, color: '#2A2E47', resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <button type="button" className="btn bp" onClick={save} disabled={saving}
                    style={{ fontSize: 12.5, padding: '8px 18px', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn bs" onClick={() => setEditing(false)} disabled={saving}
                    style={{ fontSize: 12.5, padding: '8px 16px' }}>
              Cancel
            </button>
            <span style={{ fontSize: 11.5, color: MUTED }}>
              Clearing the box removes these paragraphs from the report.
            </span>
          </div>
        </>
      )}

      {!analysis && !busy && !editing && (
        <div style={{
          borderTop: `1px solid ${LINE}`, paddingTop: 16,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <button
            type="button"
            className="btn bs"
            onClick={() => setConfirming(true)}
            style={{ fontSize: 12.5, padding: '8px 16px' }}
          >
            Analyse
          </button>
          <span style={{ fontSize: 11.5, color: MUTED }}>
            Sends this section’s figures to OpenAI. The two paragraphs it writes go into your report.
          </span>
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: 10, display: 'flex', alignItems: 'center', gap: 8,
            background: '#FEF2F2', border: '1px solid #FECACA', color: RED,
            borderRadius: 8, padding: '8px 12px', fontSize: 12.5,
          }}
        >
          <span style={{ flex: 1 }}>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss"
            style={{ border: 'none', background: 'none', color: RED, cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title={section.title}
          lines={lines}
          redo={analysis != null}
          busy={busy}
          onConfirm={() => run(analysis != null)}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  border: 'none', background: 'none', padding: 0, fontFamily: 'inherit',
  fontSize: 11.5, fontWeight: 700, color: ACCENT, cursor: 'pointer',
};

// Painted by the Preview over the section's own table while the analyser reads it.
// Must live OUTSIDE the table's overflow-x scroller, or a vertically-travelling
// band gets clipped by it and can add a scrollbar.
export function ReadingBand() {
  return <div className="analysis-sweep" aria-hidden="true" />;
}
