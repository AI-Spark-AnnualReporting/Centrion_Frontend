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
import type { EarningsSourceLine } from '@/types/earnings';
import { INK, MUTED } from './tokens';

interface Props {
  lines: EarningsSourceLine[];
  // What the section is called, so the dialog says which one is being edited.
  sectionTitle: string;
  busy?: boolean;
  onSave: (lineIds: string[]) => Promise<void>;
}

export function FigureChecklist({ lines, sectionTitle, busy, onSave }: Props) {
  // Seeded from the server's `selected` (a saved selection, else remembered,
  // else the model's picks) and owned locally from then on, so ticking is
  // instant.
  // Ticked = in this section. The dialog IS the section's figure list, so
  // unticking is how a figure is removed, not a separate delete flow.
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(lines.filter((l) => l.selected).map((l) => l.id)),
  );

  // The initializer above only runs on the first render, so a caller that mounts
  // this before its lines have loaded — which is what the outline does, one
  // section at a time — would show every row unticked no matter what the server
  // said. Re-seed when a genuinely different set of lines arrives (first load,
  // switching section, refetch after save) and NOT on an incidental re-render,
  // which would throw away ticks the user just made.
  const lineIdentity = useMemo(() => lines.map((l) => l.id).join('|'), [lines]);
  useEffect(() => {
    setTicked(new Set(lines.filter((l) => l.selected).map((l) => l.id)));
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
      const next = new Set(prev);
      if (next.has(l.id)) next.delete(l.id);
      else next.add(l.id);
      return next;
    });

  const setGroup = (rows: EarningsSourceLine[], on: boolean) =>
    setTicked((prev) => {
      const next = new Set(prev);
      rows.forEach((r) => (on ? next.add(r.id) : next.delete(r.id)));
      return next;
    });

  const save = async () => {
    setError(null);
    try {
      await onSave([...ticked]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that selection.");
    }
  };

  if (lines.length === 0) return null;

  return (
    <div className="card" style={{ marginTop: 14, padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: INK }}>
              {sectionTitle}
            </div>
            <div style={{ fontSize: 12, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
              {ticked.size} of {lines.length} in this section
            </div>
          </div>
          <div style={{ fontSize: 12, color: MUTED, margin: '2px 0 12px' }}>
            Tick a line to add it to this section. Untick to remove it.
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
                      </label>
                    ))}
                  </div>
                );
              })
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button type="button" className="btn bp bsm" disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Done'}
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
