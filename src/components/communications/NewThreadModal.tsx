import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  communications,
  ApiError,
  type CommunicationMember,
  type ThreadlessReport,
  type ThreadlessReportType,
} from '@/lib/api';
import { MentionComposer } from './MentionComposer';
import { ALL_FILTER, SECTION_LABEL } from './helpers';

/* "Start a communication" modal — pick a report type, choose a report that
   doesn't have a thread yet, brief the team, and @mention members. Wired to
   the live backend: GET threadless-reports + members on open, POST threads on
   submit. company_id is never sent — the backend derives it from the JWT.

   This is the older start-a-communication flow and is unchanged by the review
   work; sharing a report for review goes through ShareReportModal instead. */

export function NewThreadModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: (threadId?: string) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Pills — always the full unfiltered set; never derived from `reports`.
  const [types, setTypes] = useState<ThreadlessReportType[]>([]);
  const [reports, setReports] = useState<ThreadlessReport[]>([]);
  const [members, setMembers] = useState<CommunicationMember[]>([]);

  const [typeFilter, setTypeFilter] = useState<string>(ALL_FILTER);
  const [reportId, setReportId] = useState<string | null>(null);

  const [message, setMessage] = useState('');
  const [mentions, setMentions] = useState<CommunicationMember[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // On open → load reports + members in parallel.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    Promise.all([communications.threadlessReports(), communications.members()])
      .then(([reportsRes, membersRes]) => {
        if (cancelled) return;
        setTypes(reportsRes.types);
        setReports(reportsRes.reports);
        setMembers(membersRes.members);
      })
      .catch((e) => {
        if (cancelled) return;
        // 401 → the request layer already ran the session-expired flow.
        if (e instanceof ApiError && e.status === 401) return;
        setLoadError('Could not load reports. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-pull the threadless list after a stale-data error (404/409). Pills come
  // back from the same call, so the bar stays authoritative.
  const refreshReports = () => {
    setReportId(null);
    communications
      .threadlessReports()
      .then((res) => {
        setTypes(res.types);
        setReports(res.reports);
      })
      .catch(() => {});
  };

  const refreshMembers = () => {
    communications
      .members()
      .then((res) => setMembers(res.members))
      .catch(() => {});
  };

  // Pills stay constant across filters (from `types`); only the list narrows.
  const visibleReports = useMemo(
    () =>
      typeFilter === ALL_FILTER
        ? reports
        : reports.filter((r) => r.report_type === typeFilter),
    [reports, typeFilter],
  );

  // report_type code → human label for the "ESG · FY-2023" row text.
  const labelForCode = (code: string) =>
    types.find((t) => t.code === code)?.label ?? code;

  const messageEmpty = message.trim().length === 0;
  // A thread must be addressed to at least one participant.
  const needsRecipient = !messageEmpty && mentions.length === 0;
  const canSubmit = !!reportId && !messageEmpty && mentions.length > 0 && !submitting;

  const submit = async () => {
    if (!reportId || messageEmpty) return;
    if (mentions.length === 0) {
      setFormError('Add at least one participant with @ before starting.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await communications.startThread({
        report_id: reportId,
        message: message.trim(),
        // Members' UUID `id`s — NOT their usr_ `user_id`. Backend dedupes +
        // drops any self-mention, so no client-side cleanup needed.
        mentioned_user_ids: mentions.map((m) => m.id),
      });
      toast({ title: 'Thread started', description: 'Your team has been briefed.' });
      onCreated?.(res.thread.id);
      onClose();
    } catch (e) {
      if (!(e instanceof ApiError)) {
        setFormError('Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }
      switch (e.status) {
        case 422:
          setFormError("Message can't be empty");
          break;
        case 404:
          toast({ title: 'That report is no longer available', variant: 'destructive' });
          refreshReports();
          break;
        case 409:
          toast({ title: 'A conversation already exists for this report', variant: 'destructive' });
          setReports((prev) => prev.filter((r) => r.id !== reportId));
          setReportId(null);
          break;
        case 403:
          toast({ title: 'One of the mentioned people is no longer available', variant: 'destructive' });
          refreshMembers();
          break;
        case 401:
          // Session-expired flow already handled by the request layer.
          break;
        default:
          setFormError('Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ width: 620 }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '20px 22px 16px' }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 11,
              background: 'linear-gradient(150deg,#5B5BF0,#4040C8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(64,64,200,.28)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 14 14" fill="none">
              <path d="M7 2.5v9M2.5 7h9" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, color: '#9BA3C4', letterSpacing: '.9px' }}>
              NEW · START A THREAD
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#1A1D2E', marginTop: 2, letterSpacing: '-.2px' }}>
              Start a communication
            </div>
            <div style={{ fontSize: 12.5, color: '#8890AE', marginTop: 3 }}>
              Pick a report type, choose a report, and brief the team
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              flexShrink: 0,
              width: 28,
              height: 28,
              border: 'none',
              background: 'transparent',
              color: '#9BA3C4',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div style={{ padding: '0 22px 4px' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '48px 0' }}>
              <div className="proc-ring" style={{ width: 34, height: 34, borderWidth: 3 }} />
              <div style={{ fontSize: 12, color: '#9BA3C4', fontWeight: 600 }}>Loading reports…</div>
            </div>
          ) : loadError ? (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: '#DC2626', marginBottom: 12 }}>{loadError}</div>
              <button type="button" className="btn bs" onClick={refreshReports}>
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* Report type pills — always from `types`; "All" clears the filter. */}
              <div style={SECTION_LABEL}>REPORT TYPE</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 20 }}>
                {[{ code: ALL_FILTER, label: 'All', count: null as number | null }, ...types].map((t) => {
                  const active = t.code === typeFilter;
                  return (
                    <button
                      key={t.code}
                      type="button"
                      onClick={() => {
                        setTypeFilter(t.code);
                        setReportId(null);
                      }}
                      style={{
                        padding: '7px 15px',
                        borderRadius: 20,
                        fontSize: 12.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        transition: '.15s',
                        border: active ? '1.5px solid #4040C8' : '1.5px solid #E5E7EF',
                        background: active ? '#4040C8' : '#fff',
                        color: active ? '#fff' : '#5A6080',
                        boxShadow: active ? '0 4px 12px rgba(64,64,200,.25)' : 'none',
                      }}
                    >
                      {t.label}
                      {t.count != null && ` · ${t.count}`}
                    </button>
                  );
                })}
              </div>

              {/* Reports without a thread yet */}
              <div style={SECTION_LABEL}>REPORTS WITHOUT A THREAD YET</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {visibleReports.length === 0 ? (
                  <div
                    style={{
                      padding: '22px 16px',
                      border: '1px dashed #E5E7EF',
                      borderRadius: 12,
                      textAlign: 'center',
                      fontSize: 12.5,
                      color: '#9BA3C4',
                    }}
                  >
                    No reports without a thread yet.
                  </div>
                ) : (
                  visibleReports.map((r) => {
                    const selected = r.id === reportId;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setReportId(r.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 13,
                          textAlign: 'left',
                          padding: '14px 16px',
                          borderRadius: 12,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          transition: '.15s',
                          border: selected ? '1.5px solid #4040C8' : '1.5px solid #E5E7EF',
                          background: selected ? '#F5F4FF' : '#fff',
                        }}
                      >
                        <span
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            flexShrink: 0,
                            border: selected ? '5px solid #4040C8' : '1.6px solid #CBD0E4',
                            transition: '.15s',
                          }}
                        />
                        <span style={{ minWidth: 0, fontSize: 13.5, fontWeight: 700, color: '#1A1D2E' }}>
                          {labelForCode(r.report_type)} · {r.period}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              {/* First message + @mention picker */}
              <div style={SECTION_LABEL}>START THE THREAD WITH A MESSAGE</div>

              <MentionComposer
                members={members}
                currentUserId={user?.user_id}
                message={message}
                onMessageChange={(v) => {
                  setMessage(v);
                  if (formError) setFormError(null);
                }}
                mentions={mentions}
                onMentionsChange={setMentions}
                placeholder="Write the first message to the team...  (type @ to mention)"
              />

              {(formError || needsRecipient) && (
                <div
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    marginTop: 7,
                    color: formError ? '#DC2626' : '#9BA3C4',
                  }}
                >
                  {formError ?? 'Add at least one participant with @ to start.'}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '18px 22px 20px' }}>
          <button type="button" className="btn bs" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn bp"
            style={{ gap: 7, opacity: canSubmit ? 1 : 0.55, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
            disabled={!canSubmit}
            onClick={submit}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M12.5 1.5L6 8M12.5 1.5L8.3 12.5l-2.3-4.5L1.5 5.7 12.5 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
            {submitting ? 'Starting…' : 'Start thread'}
          </button>
        </div>
      </div>
    </div>
  );
}
