import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { communications } from '@/lib/api';
import type { ThreadSummary } from '@/lib/api';
import { abbreviateName, relativeTime } from '@/components/communications/helpers';
import { statusPill } from './report-status';

/**
 * Shareholder Comms — the three most recently active Communication Hub threads.
 *
 * Rows arrive from GET /communications/threads pre-sorted (updated_at desc); take the
 * front and never re-sort. Any click opens the hub — deep-linking to a single thread is
 * deliberately not done here, the hub can route onwards.
 */

const ACCENT = '#4040C8';
const MAX_ROWS = 3;

// Avatar codes match ActiveReportsCard's, so the two cards read as a set. This is the
// Communication Hub's report_type vocabulary, which differs from the reports list's
// ('board' here vs 'board_pack' there) — hence its own map rather than a shared one.
const TYPE_INITIALS: Record<string, string> = {
  annual: 'AR', quarterly: 'QR', esg: 'SR', board: 'BP',
  earnings: 'ER', agm: 'AG', dividend: 'DV', press: 'PR',
};

function initialsFor(reportType?: string | null): string {
  const k = (reportType ?? '').toLowerCase();
  return TYPE_INITIALS[k] ?? (reportType || 'R').slice(0, 2).toUpperCase();
}

/**
 * The most useful true thing about this thread, most actionable first: unread messages
 * beat who's holding it, which beats the last reply, which beats who started it. Always
 * resolves to something — a row is never left with a blank line.
 */
function leadLine(t: ThreadSummary): string {
  if (t.unread_count > 0) return `${t.unread_count} new`;
  if (t.assignment) {
    return t.assignment.is_you ? 'With you' : `With ${abbreviateName(t.assignment.full_name)}`;
  }
  if (t.last_message) {
    return t.last_message.is_you ? 'You replied' : `${abbreviateName(t.last_message.sender_full_name)} replied`;
  }
  if (t.owner) return `Started by ${t.owner.is_you ? 'you' : abbreviateName(t.owner.full_name)}`;
  return t.report ? t.report.type_label : 'Discussion';
}

export function ShareholderCommsCard() {
  const navigate = useNavigate();
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setThreads(null);
    setFailed(false);
    communications
      .listThreads()
      .then((r) => { if (!cancelled) setThreads(r?.threads ?? []); })
      // Sibling cards swallow errors into an empty list, which renders a failure as "you
      // have nothing". Keep the two apart so a broken request never reads as no activity.
      .catch(() => { if (!cancelled) { setThreads([]); setFailed(true); } });
    return () => { cancelled = true; };
  }, [attempt]);

  const openHub = () => navigate('/comms');
  const rows = (threads ?? []).slice(0, MAX_ROWS);

  return (
    <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: ACCENT, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.6px', textTransform: 'uppercase', color: '#5A6080' }}>Shareholder Comms</span>
        </div>
        <button type="button" onClick={openHub} style={{ fontSize: 12, fontWeight: 700, color: ACCENT, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>Hub →</button>
      </div>
      <div style={{ height: 1, background: '#ECEEF8', margin: '8px 0 2px' }} />

      {threads === null ? (
        <div style={{ padding: '18px 0', fontSize: 12.5, color: '#9BA3C4' }}>Loading…</div>
      ) : failed ? (
        <div style={{ padding: '18px 2px', fontSize: 12.5, color: '#9BA3C4', lineHeight: 1.6 }}>
          Couldn't load conversations. <button type="button" onClick={() => setAttempt((n) => n + 1)} style={{ color: ACCENT, fontWeight: 700, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>Retry</button>
        </div>
      ) : rows.length === 0 ? (
        <div style={{ padding: '18px 2px', fontSize: 12.5, color: '#9BA3C4', lineHeight: 1.6 }}>
          No conversations yet. <button type="button" onClick={openHub} style={{ color: ACCENT, fontWeight: 700, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>Open the hub →</button>
        </div>
      ) : (
        rows.map((t, i) => {
          const pill = t.report ? statusPill(t.report.status, t.report.status_label) : null;
          const when = relativeTime(t.updated_at);
          return (
            <div
              key={t.thread_id}
              onClick={openHub}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openHub(); } }}
              role="button"
              tabIndex={0}
              style={{ cursor: 'pointer', display: 'flex', gap: 11, alignItems: 'center', padding: '11px 0', borderTop: i ? '1px solid #F4F5FA' : 'none' }}
            >
              <span style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: ACCENT, background: 'rgba(64,64,200,.1)' }}>{t.report ? initialsFor(t.report.report_type) : 'DS'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1A1D2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.report ? t.report.title : (t.subject?.trim() || 'Discussion')}</div>
                <div style={{ fontSize: 10.5, color: '#9BA3C4', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {leadLine(t)}{when ? ` · ${when}` : ''}
                </div>
              </div>
              {pill && (
                <span style={{ fontSize: 9, fontWeight: 800, color: pill.color, background: pill.bg, padding: '3px 8px', borderRadius: 999, letterSpacing: '.4px', flexShrink: 0 }}>{pill.text}</span>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

export default ShareholderCommsCard;
