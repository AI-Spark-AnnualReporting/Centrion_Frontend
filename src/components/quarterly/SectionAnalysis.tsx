import { useCallback, useEffect, useRef, useState } from 'react';
import { quarterlyReports } from '@/lib/api';
import type { ProducedSection, SectionAnalysis as Analysis } from '@/types/quarterly';
import { tableRowCount } from './sectionState';

const ACCENT = '#4040C8';
const DARK = '#1A1D2E';
const MUTED = '#6B7280';
const LINE = '#ECEEF8';
const AMBER = '#B45309';
const RED = '#DC2626';

// The figures leave the building, so the wait is real and worth bounding: request()
// has no timeout of its own and would otherwise hang for as long as the browser allows.
const TIMEOUT_MS = 90_000;
const SLOW_AFTER_MS = 20_000;

function figureCount(section: ProducedSection): number {
  try {
    return tableRowCount(JSON.parse(section.content ?? ''));
  } catch {
    return 0;
  }
}

function whenLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ── The second consent ───────────────────────────────────────────────────────
// Shell mirrors ApproveConfirmDialog, which is the house convention for
// confirming a server action. Focus handling is the one thing added: no dialog
// in this app traps focus, and a consent dialog is where that actually matters.
function ConfirmDialog({
  title, lines, busy, onConfirm, onClose,
}: {
  title: string;
  lines: number;
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
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(460px, 100%)', background: '#fff', borderRadius: 16,
          boxShadow: '0 24px 60px rgba(20,22,40,.28)', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '20px 22px 4px' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: DARK }}>Analyse this section?</div>
          <p style={{ margin: '10px 0 0', fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
            This sends the <strong>{lines} {lines === 1 ? 'line' : 'lines'}</strong> of figures in{' '}
            <strong>{title}</strong> to OpenAI to be read and summarised. Nothing else from your
            report is sent.
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
            The analysis appears on this screen only — it is not added to the report you export.
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
            Analyse
          </button>
        </div>
      </div>
    </div>
  );
}

// ── The waiting state ────────────────────────────────────────────────────────
// No fabricated stage cycling: the client cannot know which stage the server is
// in, so the line states the scope (true) and the band carries the motion.
function Reading({ lines, slow }: { lines: number; slow: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex', alignItems: 'center', gap: 9,
        marginTop: 12, fontSize: 12.5, fontWeight: 600, color: ACCENT,
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

// ── The result ───────────────────────────────────────────────────────────────
function Result({
  analysis, stale, busy, onRedo,
}: {
  analysis: Analysis;
  stale: boolean;
  busy: boolean;
  onRedo: () => void;
}) {
  const paragraphs = analysis.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <div style={{ marginTop: 14, borderLeft: `2px solid ${ACCENT}`, paddingLeft: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: ACCENT, textTransform: 'uppercase' }}>
          Analysis
        </span>
        <span style={{ fontSize: 11, color: MUTED }}>
          {analysis.model}
          {analysis.generated_at ? ` · ${whenLabel(analysis.generated_at)}` : ''}
        </span>
        <button
          type="button"
          onClick={onRedo}
          disabled={busy}
          style={{
            marginLeft: 'auto', border: 'none', background: 'none', padding: 0,
            fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, color: ACCENT,
            cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1,
          }}
        >
          Re-analyse
        </button>
      </div>

      {stale && (
        <div style={{ marginBottom: 8, fontSize: 12, color: AMBER }}>
          The figures changed after this was written. Re-analyse for an up-to-date read.
        </div>
      )}

      {paragraphs.map((p, i) => (
        <p key={i} style={{ margin: i ? '10px 0 0' : 0, fontSize: 13.5, lineHeight: 1.75, color: '#2A2E47' }}>
          {p}
        </p>
      ))}

      {!!analysis.warnings?.length && (
        <div style={{ marginTop: 10, fontSize: 11.5, color: AMBER }}>
          Check these against the table — {analysis.warnings.join('; ')}
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 11, color: MUTED }}>
        Written by AI from the figures above. Not included in the exported report.
      </div>
    </div>
  );
}

// ── The whole control ────────────────────────────────────────────────────────
export default function SectionAnalysis({
  companyId, reportId, section, onBusyChange,
}: {
  companyId: string;
  reportId: string;
  section: ProducedSection;
  // Lets the Preview paint the reading band over the section's own table while
  // this is waiting — the band has to sit outside the table's overflow scroller.
  onBusyChange?: (busy: boolean) => void;
}) {
  const [analysis, setAnalysis] = useState<Analysis | null>(section.analysis ?? null);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

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
    } catch (err: unknown) {
      if (!mounted.current) return;
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      setError(aborted
        ? 'That took too long. Please try again.'
        : err instanceof Error ? err.message : 'The analysis could not be generated.');
    } finally {
      window.clearTimeout(slowTimer);
      window.clearTimeout(killTimer);
      if (mounted.current) {
        setBusy(false);
        setSlow(false);
      }
    }
  }, [companyId, reportId, section.section_code, section.content]);

  return (
    <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 22, paddingTop: 16 }}>
      {busy && (
        // The band is rendered by the parent over the table; this is the honest half.
        <Reading lines={lines} slow={slow} />
      )}

      {!busy && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {!analysis && (
            <button
              type="button"
              className="btn bs"
              onClick={() => setConfirming(true)}
              style={{ fontSize: 12.5, padding: '8px 16px' }}
            >
              Analyse
            </button>
          )}
          <span style={{ fontSize: 11.5, color: MUTED }}>
            {analysis
              ? 'Analysis is written by AI and stays on this screen.'
              : 'Sends this section’s figures to OpenAI to be read.'}
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

      {analysis && !busy && (
        <Result analysis={analysis} stale={stale} busy={busy} onRedo={() => setConfirming(true)} />
      )}

      {confirming && (
        <ConfirmDialog
          title={section.title}
          lines={lines}
          busy={busy}
          onConfirm={() => run(analysis != null)}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

// Exported so the Preview can paint the reading band over the section's own table
// while this control is waiting. It has to live OUTSIDE the table's own
// overflow-x scroller, or a vertically-travelling band gets clipped by it.
export function ReadingBand() {
  return <div className="analysis-sweep" aria-hidden="true" />;
}
