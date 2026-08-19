// Step 2's checklist: which of the quarterly report's own lines go into the
// earnings release.
//
// In user-metrics mode the quarterly report is built from the user's own workbook,
// so earnings can canonicalise only the handful of lines whose label exactly
// matches its registry — 8 of 51 on the report this was built against. The first
// attempt at closing that gap made the user pick a metric and then hunt a line, one
// at a time, through 233 rows in which seven consecutive entries all read "Balance
// at September 30, 2023". So: a model pre-ticks what an earnings release carries,
// and this is where the user confirms it.
//
// Every row shows `label — column`, because the column is the only thing telling
// those seven equity balances apart.

import { useEffect, useMemo, useState } from 'react';
import type { EarningsSourceLine, EarningsFigureSection } from '@/types/earnings';
import { INK, MUTED } from './tokens';

interface Props {
  lines: EarningsSourceLine[];
  sections: EarningsFigureSection[];
  suggestedCount?: number;
  busy?: boolean;
  onSaveSelection: (
    selections: { line_id: string; section_code: string }[],
  ) => Promise<void>;
}

export function FigureChecklist({
  lines,
  sections,
  suggestedCount = 0,
  busy,
  onSaveSelection,
}: Props) {
  const fallbackSection = sections[0]?.section_code ?? '';
  const homeFor = (l: EarningsSourceLine) => l.section_code || fallbackSection;
  // Seeded from the server's `selected` (a saved selection, else remembered,
  // else the model's picks) and owned locally from then on, so ticking is
  // instant.
  // A Map, not a Set: ticking a line and choosing where it goes are the same
  // decision, so the section travels with the tick.
  const [ticked, setTicked] = useState<Map<string, string>>(
    () => new Map(lines.filter((l) => l.selected).map((l) => [l.id, homeFor(l)])),
  );

  // The initializer above only runs on the first render, so a caller that mounts
  // this before its lines have loaded — which is what the outline does, one
  // section at a time — would show every row unticked no matter what the server
  // said. Re-seed when a genuinely different set of lines arrives (first load,
  // switching section, refetch after save) and NOT on an incidental re-render,
  // which would throw away ticks the user just made.
  const lineIdentity = useMemo(() => lines.map((l) => l.id).join('|'), [lines]);
  useEffect(() => {
    setTicked(new Map(lines.filter((l) => l.selected).map((l) => [l.id, homeFor(l)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineIdentity]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const out = new Map<string, EarningsSourceLine[]>();
    for (const l of lines) {
      if (needle && !l.display_label.toLowerCase().includes(needle)) continue;
      const table = l.table ?? 'Other';
      if (!out.has(table)) out.set(table, []);
      out.get(table)!.push(l);
    }
    return [...out.entries()];
  }, [lines, search]);

  const toggle = (l: EarningsSourceLine) =>
    setTicked((prev) => {
      const next = new Map(prev);
      if (next.has(l.id)) next.delete(l.id);
      else next.set(l.id, homeFor(l));
      return next;
    });

  const setSection = (id: string, sectionCode: string) =>
    setTicked((prev) => {
      const next = new Map(prev);
      // Choosing a section is also a way of saying "yes, include this".
      next.set(id, sectionCode);
      return next;
    });

  const setGroup = (rows: EarningsSourceLine[], on: boolean) =>
    setTicked((prev) => {
      const next = new Map(prev);
      rows.forEach((r) => (on ? next.set(r.id, homeFor(r)) : next.delete(r.id)));
      return next;
    });

  const save = async () => {
    setError(null);
    try {
      await onSaveSelection(
        [...ticked].map(([line_id, section_code]) => ({ line_id, section_code })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that selection.");
    }
  };

  if (lines.length === 0) return null;

  return (
    <div className="card" style={{ marginTop: 14, padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: INK }}>
              Figures from your quarterly report
            </div>
            <div style={{ fontSize: 12, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
              {ticked.size} of {lines.length} selected
            </div>
          </div>
          <div style={{ fontSize: 12, color: MUTED, margin: '2px 0 12px' }}>
            {suggestedCount > 0
              ? `We pre-selected ${suggestedCount} that belong in an earnings release. Adjust anything you like.`
              : 'Tick the lines you want in this earnings report.'}
          </div>

          <input
            className="inp"
            value={search}
            aria-label="Search your report's lines"
            placeholder="Search your report's lines"
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginBottom: 8 }}
          />

          <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid #E8EAF3', borderRadius: 8 }}>
            {grouped.length === 0 ? (
              <div style={{ padding: 14, fontSize: 12, color: MUTED }}>No lines match that search.</div>
            ) : (
              grouped.map(([table, rows]) => {
                const allOn = rows.every((r) => ticked.has(r.id));
                return (
                  <div key={table}>
                    <div
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: 10, padding: '6px 12px', background: '#F7F8FC',
                        position: 'sticky', top: 0,
                      }}
                    >
                      <span style={{
                        fontSize: 10, fontWeight: 800, color: MUTED,
                        textTransform: 'uppercase', letterSpacing: '.04em',
                      }}>
                        {table} · {rows.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => setGroup(rows, !allOn)}
                        style={{
                          border: 'none', background: 'none', padding: 0, font: 'inherit',
                          fontSize: 11, fontWeight: 700, color: '#4040C8', cursor: 'pointer',
                        }}
                      >
                        {allOn ? 'Clear' : 'Select all'}
                      </button>
                    </div>
                    {rows.map((l) => (
                      <label
                        key={l.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px',
                          borderTop: '1px solid #F0F1F7', fontSize: 12, color: INK,
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={ticked.has(l.id)}
                          onChange={() => toggle(l)}
                          aria-label={l.display_label}
                        />
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {l.display_label}
                        </span>
                        <span style={{ flexShrink: 0, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
                          {l.value?.toLocaleString()} {l.unit}
                        </span>
                        {/* Where this figure goes. Disabled until the line is
                            ticked, so the control cannot imply a figure is in the
                            report when it is not. */}
                        <select
                          className="inp sel"
                          aria-label={`Section for ${l.display_label}`}
                          disabled={!ticked.has(l.id)}
                          value={ticked.get(l.id) ?? homeFor(l)}
                          onChange={(e) => setSection(l.id, e.target.value)}
                          onClick={(e) => e.preventDefault()}
                          style={{ flexShrink: 0, width: 200, fontSize: 11, padding: '3px 6px' }}
                        >
                          {sections.map((sec) => (
                            <option key={sec.section_code} value={sec.section_code}>
                              {sec.title}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                );
              })
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button type="button" className="btn bp bsm" disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save selection'}
            </button>
          </div>
      {error && (
        <div role="alert" style={{ marginTop: 10, fontSize: 12, color: '#B33A3E', fontWeight: 700 }}>
          {error}
        </div>
      )}
    </div>
  );
}
