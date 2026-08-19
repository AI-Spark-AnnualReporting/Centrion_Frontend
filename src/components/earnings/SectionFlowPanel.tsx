// What a financial section is going to do, and the one thing you can change about it.
//
// A section arrives named by the catalogue — "Non-IFRS Reconciliations" — and a
// company that calls it something else has no way to say so. Renaming is easy to
// offer and easy to distrust: the obvious fear is that renaming the box changes
// what goes in it. So the rename sits INSIDE an explanation of the section's whole
// path, and the explanation says plainly that the name is not part of it.
//
// That claim is true by construction, not by promise: the picker is prompted with
// the catalogue name and the section's own core rules, both keyed on section_code,
// and the backend function that builds them takes no report id at all.

import { useEffect, useRef, useState } from 'react';
import type { EarningsOutlineSection } from '@/types/earnings';
import { INK, MUTED, FAINT, ACCENT, BORDER_SOFT, DANGER } from './tokens';

// What each section carries, in the user's terms rather than the model's. Kept
// here rather than in the DB on purpose: this describes the section's PURPOSE,
// which is stable, while earnings_sections.figure_prompt_core describes how to
// pick lines and is meant to be retuned without a deploy. A code with no entry
// simply loses this line.
const CARRIES: Record<string, string> = {
  s04_financial_highlights:
    'The headline numbers — revenue, operating income, net income, EPS — as consolidated totals.',
  s06_operational_kpis:
    'How the business ran: volumes, capacity, utilisation, reliability, safety.',
  s07_segment_performance: 'The same results, broken out by business segment.',
  s09_capital_allocation:
    'What you did with the cash and what shareholders got — dividends, buybacks, capex, gearing.',
  s10_balance_sheet: 'Where you stood at period end — assets, equity, cash, borrowings.',
  s10b_cash_flow:
    'The cash the period generated and spent — operating cash flow, capex, free cash flow.',
  s12_consensus: 'The measures analysts forecast, set against what you actually delivered.',
  s14_condensed_statements:
    'The primary statements in summary — income, balance sheet, cash flow.',
  s15_non_ifrs_recon:
    'The reconciliation working — the bridge from each IFRS measure to its non-IFRS counterpart.',
};

function Step({ n, head, children }: { n: number; head: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
      <span
        style={{
          flexShrink: 0,
          width: 17,
          height: 17,
          marginTop: 1,
          borderRadius: 5,
          background: '#EEEEFF',
          color: ACCENT,
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-hidden
      >
        {n}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: INK, lineHeight: 1.4 }}>{head}</div>
        <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.5, marginTop: 1 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function SectionFlowPanel({
  section,
  figureCount,
  onRename,
}: {
  section: EarningsOutlineSection;
  figureCount?: number;
  /** Resolves when saved; rejects to roll the name back. Empty string resets it. */
  onRename: (title: string) => Promise<void>;
}) {
  const original = section.title_original ?? section.title;
  const [draft, setDraft] = useState(section.title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  // A name typed on another row, or a Reset, should land here rather than being
  // held out by stale local state.
  useEffect(() => setDraft(section.title), [section.title]);

  const renamed = section.title !== original;
  const dirty = draft.trim() !== section.title.trim();

  const commit = async (value: string) => {
    const next = value.trim();
    if (next === section.title.trim()) return;
    setSaving(true);
    setError('');
    try {
      await onRename(next);
    } catch {
      setDraft(section.title); // put the old name back rather than lie
      setError("That name didn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const table = section.mode === 'table' || section.mode === 'kpi';
  const feeder = section.feeder;

  return (
    <div
      style={{
        borderTop: `1px solid ${BORDER_SOFT}`,
        padding: '13px 14px 15px 56px',
        display: 'flex',
        flexDirection: 'column',
        gap: 13,
      }}
    >
      {/* The rename, and immediately under it the reason it is safe. */}
      <div>
        <label
          htmlFor={`rename-${section.section_code}`}
          style={{
            display: 'block',
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '.7px',
            textTransform: 'uppercase',
            color: FAINT,
            marginBottom: 5,
          }}
        >
          Section name
        </label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            id={`rename-${section.section_code}`}
            ref={ref}
            className="inp"
            value={draft}
            disabled={saving}
            maxLength={120}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => void commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                ref.current?.blur();
              }
              if (e.key === 'Escape') {
                setDraft(section.title);
                ref.current?.blur();
              }
            }}
            style={{ flex: 1, minWidth: 0, fontSize: 12.5, padding: '8px 11px', color: INK }}
          />
          {dirty && !saving && (
            <button type="button" className="btn bp bsm" onClick={() => void commit(draft)}>
              Save
            </button>
          )}
          {renamed && !dirty && (
            <button
              type="button"
              className="btn bs bsm"
              disabled={saving}
              onClick={() => void commit('')}
              title={`Back to “${original}”`}
            >
              Reset
            </button>
          )}
        </div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 6, lineHeight: 1.5 }}>
          Renaming changes the heading only — here, on Figures, and in the exported
          report. This section is identified by what it <em>is</em>, not what it is
          called, so the figures it collects do not change.
          {renamed && (
            <span style={{ color: FAINT }}> Originally “{original}”.</span>
          )}
        </div>
        {error && (
          <div role="alert" style={{ fontSize: 11.5, color: DANGER, fontWeight: 700, marginTop: 6 }}>
            {error}
          </div>
        )}
      </div>

      {/* What is going to happen here, end to end. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {CARRIES[section.section_code] && (
          <Step n={1} head="What it carries">
            {CARRIES[section.section_code]}
          </Step>
        )}

        <Step n={2} head="Where the numbers come from">
          {feeder?.status === 'ready' && feeder.source_label ? (
            <>
              <span style={{ color: INK, fontWeight: 600 }}>{feeder.source_label}</span>, read
              as its own lines — never retyped, never invented.
            </>
          ) : (
            feeder?.message ?? 'The reports and documents you picked on Setup.'
          )}
        </Step>

        <Step n={3} head="How they get chosen">
          On <span style={{ fontWeight: 600, color: INK }}>Figures</span> you say what you
          want here in your own words. We search your report's own lines — only ones no
          other section has taken — and you add or remove any of them by hand.
        </Step>

        <Step n={4} head="What lands in the report">
          {table ? 'A table of the figures you keep' : 'Written prose grounded in those figures'}
          {figureCount !== undefined && (
            <>
              {' · '}
              <span style={{ fontFamily: "'DM Mono', monospace", color: INK }}>
                {figureCount} chosen so far
              </span>
            </>
          )}
          .
        </Step>
      </div>
    </div>
  );
}
