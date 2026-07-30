/**
 * The reports.status vocabulary (schema.sql `valid_report_status`) as a display pill.
 *
 * Shared so the dashboard cards agree on what a status looks like. The Communication Hub
 * still paints every status the same amber (CommunicationHubPage / ReviewerView) — that
 * drift started with one hardcoded copy, so new callers import this instead.
 *
 * Colours are the existing badge palette from index.css; no new colour enters the system.
 */

export interface StatusPill {
  text: string;
  color: string;
  bg: string;
}

const STATUS_PILL: Record<string, StatusPill> = {
  draft:            { text: 'DRAFT',            color: '#5A6080', bg: '#E8EAF5' },
  in_review:        { text: 'IN REVIEW',        color: '#B45309', bg: 'rgba(245,158,11,.12)' },
  pending_approval: { text: 'PENDING APPROVAL', color: '#7C3AED', bg: 'rgba(139,92,246,.12)' },
  approved:         { text: 'APPROVED',         color: '#16A34A', bg: 'rgba(34,197,94,.12)' },
  locked:           { text: 'LOCKED',           color: '#0D9488', bg: 'rgba(20,184,166,.12)' },
  published:        { text: 'PUBLISHED',        color: '#2563EB', bg: 'rgba(59,130,246,.12)' },
};

const UNKNOWN = { color: '#5A6080', bg: '#E8EAF5' };

/**
 * Pill for a raw `reports.status` code. An empty status falls back to DRAFT (the column's
 * DB default); an unrecognised future code still renders — greyed and humanised — rather
 * than vanishing.
 *
 * `label` overrides the displayed text: pass the backend's `status_label` where one is
 * available (the Communication Hub sends one) so wording stays server-owned.
 */
export function statusPill(status?: string | null, label?: string | null): StatusPill {
  const key = (status ?? '').trim().toLowerCase();
  const known = key ? STATUS_PILL[key] : STATUS_PILL.draft;
  const text = label?.trim() ? label.trim().toUpperCase() : null;
  if (known) return text ? { ...known, text } : known;
  return { ...UNKNOWN, text: text ?? key.toUpperCase().replace(/_/g, ' ') };
}
