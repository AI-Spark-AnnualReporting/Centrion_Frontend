// The lines this company told us to stop asking about, and the way back.
//
// "Never ask me about this again" is the right default — it is what stops the
// first quarter's work repeating every quarter. But without this panel a mis-click
// is permanent and the only remedy is a DELETE against the database by hand, so
// the exclusion is the one decision on this screen that could not be revisited.
//
// Rendered even when there is nothing left to file: a user who excluded everything
// sees an empty review screen, and that is exactly when they need to get back in.

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { quarterlyReports } from '@/lib/api';
import type { ExclusionEntry } from '@/types/quarterly';

const MUTED = '#6B7280';
const DARK = '#1F2340';

export function ExcludedLines({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ExclusionEntry[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await quarterlyReports.listExclusions(companyId);
      setRows(res.exclusions);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load your excluded lines.');
      setRows([]);
    }
  }, [companyId]);

  // Fetched only when the panel is opened. Most users never look, and this list is
  // company-wide rather than part of the report payload.
  useEffect(() => {
    if (open && rows === null) void load();
  }, [open, rows, load]);

  const restore = async (label: string) => {
    setBusy(label);
    setError(null);
    try {
      await quarterlyReports.undoExclusions(companyId, [label]);
      // Drop it locally rather than refetching — the server has already deleted
      // every row for this wording, so a round trip would show the same list.
      setRows((prev) => (prev ?? []).filter((r) => r.source_label !== label));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : `Could not restore “${label}”.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <button
        type="button"
        className="ch"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          borderBottom: open ? '1px solid #ECEEF8' : 'none',
          cursor: 'pointer',
          font: 'inherit',
          textAlign: 'left',
        }}
      >
        <span className="ct" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Lines you've excluded
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#9BA3C4' }}>
          {rows === null ? 'never asked about again' : `${rows.length} hidden`}
        </span>
      </button>

      {open && (
        <div className="cb" style={{ maxHeight: 260, overflowY: 'auto', padding: 0 }}>
          {error && (
            <div style={{ padding: '12px 18px', fontSize: 12, color: '#B45309' }}>{error}</div>
          )}
          {rows === null ? (
            <div style={{ padding: '16px 18px', fontSize: 12, color: MUTED }}>Loading…</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: '16px 18px', fontSize: 12, color: MUTED }}>
              You haven't excluded anything yet. Excluded lines are skipped on every
              future report, and you can bring them back here.
            </div>
          ) : (
            rows.map((r) => (
              <div
                key={r.source_label}
                data-testid={`excluded-${r.source_label}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '9px 18px',
                  borderTop: '1px solid #F1F2F8',
                }}
              >
                <span style={{ fontSize: 12.5, color: DARK, minWidth: 0, overflowWrap: 'anywhere' }}>
                  {r.source_label}
                </span>
                <button
                  type="button"
                  className="btn bs"
                  disabled={busy === r.source_label}
                  onClick={() => void restore(r.source_label)}
                  style={{ fontSize: 11, padding: '4px 10px', flexShrink: 0 }}
                >
                  {busy === r.source_label ? 'Restoring…' : 'Ask me again'}
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
