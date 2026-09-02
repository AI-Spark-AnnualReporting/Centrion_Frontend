import { Fragment, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import BrandUploadBox from '@/components/brand/BrandUploadBox';
import { DOC_ACCEPT, DOC_EXTS, formatBytes, hasExt } from '@/types/brand';
import {
  PHOTO_ACCEPT,
  PHOTO_HEIGHT,
  PHOTO_WIDTH,
  readProfilePhoto,
  validatePhotoFile,
} from '@/lib/image';
import { gradientFor, initialsOf } from '@/lib/avatar';
import { ApiError, team, type TeamExperience, type TeamMemberCv } from '@/lib/api';

// What the modal needs off a person. Structurally satisfied by the Person view
// model in StakeholdersPage without importing it.
interface ProfilePerson {
  id: string;
  // The usr_… address. Every sub-resource below keys off this, never off `id`.
  userId: string | null;
  firstName: string;
  lastName: string;
  role: string;
  email: string;
  bio: string;
  status: 'active' | 'inactive' | 'pending';
}

interface MemberProfileModalProps {
  companyId: string;
  person: ProfilePerson;
  companyName: string;
  positionLabel: string;
  positionBadgeClass: string;
  /** Self, or leadership:create. False renders the panel read-only. */
  canEdit: boolean;
  /** Seeded from GET /team?include=experience so the list needs no extra call. */
  experiences: TeamExperience[];
  onExperiencesChange: (next: TeamExperience[]) => void;
  /** Lifted so the roster card can show the photo without refetching it. */
  photoUri: string | null;
  onPhotoChange: (next: string | null) => void;
  onClose: () => void;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// 'YYYY-MM' → 'Mar 2019'. date-fns would need a Date, and constructing one from
// a month string reintroduces the timezone off-by-one this format exists to
// avoid — so parse the two numbers directly.
function formatMonth(value: string): string {
  const [y, m] = value.split('-');
  const idx = Number(m) - 1;
  if (!y || Number.isNaN(idx) || idx < 0 || idx > 11) return value;
  return `${MONTHS[idx]} ${y}`;
}

function periodOf(e: TeamExperience): string {
  return `${formatMonth(e.from_month)} — ${e.to_month ? formatMonth(e.to_month) : 'Present'}`;
}

// ApiError already lifts the backend's {detail: "..."} into .message for 4xx,
// and those read as plain sentences — safe to surface as-is.
function messageOf(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

function isNotFound(e: unknown): boolean {
  return e instanceof ApiError && e.status === 404;
}

interface DraftState {
  jobTitle: string;
  company: string;
  from: string;
  to: string;
  present: boolean;
  responsibility: string;
}

const EMPTY_DRAFT: DraftState = {
  jobTitle: '',
  company: '',
  from: '',
  to: '',
  present: false,
  responsibility: '',
};

const STATUS_BADGE: Record<ProfilePerson['status'], string> = {
  active: 'b-gn',
  pending: 'b-am',
  inactive: 'b-gy',
};

const STATUS_LABEL: Record<ProfilePerson['status'], string> = {
  active: 'Active',
  pending: 'Pending',
  inactive: 'Inactive',
};

const badgeStyle = {
  fontSize: 10,
  fontWeight: 700,
  padding: '3px 10px',
  borderRadius: 999,
  whiteSpace: 'nowrap',
} as const;

const sectionTitleStyle = {
  fontSize: 12,
  fontWeight: 800,
  color: '#1A1D2E',
  letterSpacing: '-.1px',
} as const;

// Markdown mixes paragraph, heading and list line boxes of different heights,
// so no fixed clamp can reliably land on a line boundary — it will sometimes
// cut a line through the middle of the glyphs. The fade dissolves whatever the
// cut lands on, so a part-line reads as "there is more below" rather than as
// broken rendering. (-webkit-line-clamp would snap to whole lines but counts
// unreliably once a -webkit-box has block children, which markdown always has.)
const FADE = 'linear-gradient(to bottom, #000 58%, transparent 100%)';

const clampStyle = {
  maxHeight: 56,
  overflow: 'hidden',
  maskImage: FADE,
  WebkitMaskImage: FADE,
} as const;

// Expanded, the prose scrolls inside its own row instead of stretching the
// panel: a pasted job description runs to hundreds of lines, and letting it
// set the modal height is what buried the rest of the form.
const expandedStyle = {
  maxHeight: 260,
  overflowY: 'auto',
  paddingRight: 8,
} as const;

const nowrapStyle = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

const errorStyle = {
  fontSize: 11,
  fontWeight: 600,
  color: '#B33A3E',
  background: 'rgba(229,72,77,.08)',
  border: '1px solid rgba(229,72,77,.25)',
  padding: '8px 12px',
  borderRadius: 8,
} as const;

const linkButtonStyle = {
  padding: 0,
  border: 'none',
  background: 'none',
  color: '#4040C8',
  font: 'inherit',
  fontWeight: 700,
  cursor: 'pointer',
} as const;

// Whether the clamp can actually bite. Measuring the rendered box would be
// exact but costs a layout pass and a ref per row; at roughly 90 characters a
// line across the full panel width, anything past three lines' worth - or with
// its own line breaks - is safely a "Show more" candidate.
function isLongProse(text: string): boolean {
  return text.length > 270 || text.includes('\n');
}

export default function MemberProfileModal({
  companyId,
  person,
  companyName,
  positionLabel,
  positionBadgeClass,
  canEdit,
  experiences,
  onExperiencesChange,
  photoUri,
  onPhotoChange,
  onClose,
}: MemberProfileModalProps) {
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [cv, setCv] = useState<TeamMemberCv | null>(null);
  const [cvError, setCvError] = useState<string | null>(null);
  const [cvBusy, setCvBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  // The row the form is currently editing, or null when it is adding a new one.
  const [editingId, setEditingId] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const userId = person.userId;
  const fullName = [person.firstName, person.lastName].filter(Boolean).join(' ');

  const toggleRow = (id: string) =>
    setExpandedRows((r) => ({ ...r, [id]: !r[id] }));

  // Escape closes, since the backdrop deliberately does not.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The CV is absent from GET /team entirely, and the roster's signed photo
  // URL expires an hour after the page loaded — a popup opened on a tab left
  // open all afternoon would render a dead link. Both are re-read here; the
  // calls are cheap. Experience already arrived with the roster.
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    void (async () => {
      const [photoRes, cvRes] = await Promise.allSettled([
        team.photo.get(companyId, userId),
        team.cv.get(companyId, userId),
      ]);
      if (!live) return;
      // No photo is a 200 with a null URL, not a 404 — the opposite of the CV.
      if (photoRes.status === 'fulfilled') {
        onPhotoChange(photoRes.value.photo_url);
      } else {
        setPhotoError(messageOf(photoRes.reason, 'Could not load the photo.'));
      }
      // No CV yet answers 404. That is the empty state, not a failure, and
      // must not paint an error.
      if (cvRes.status === 'fulfilled') {
        setCv(cvRes.value);
      } else if (!isNotFound(cvRes.reason)) {
        setCvError(messageOf(cvRes.reason, 'Could not load the CV.'));
      }
      setLoading(false);
    })();
    return () => {
      live = false;
    };
    // onPhotoChange is a fresh closure each render; depending on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, userId]);

  const setField = <K extends keyof DraftState>(key: K, value: DraftState[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const canSubmit =
    !!userId &&
    !saving &&
    draft.jobTitle.trim().length > 0 &&
    draft.company.trim().length > 0 &&
    draft.from.length > 0;

  const startEdit = (e: TeamExperience) => {
    setEditingId(e.id);
    setFormError(null);
    setDraft({
      jobTitle: e.job_title,
      company: e.company,
      from: e.from_month,
      to: e.to_month ?? '',
      // A null to_month is what Present means, so the box has to come back
      // ticked or saving would silently give the entry an end date of ''.
      present: e.to_month === null,
      responsibility: e.responsibility,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormError(null);
    setDraft(EMPTY_DRAFT);
  };

  // The form sits below the list, so on a long history the pencil would
  // otherwise look like it did nothing.
  useEffect(() => {
    if (editingId) formRef.current?.scrollIntoView({ block: 'nearest' });
  }, [editingId]);

  const submitExperience = async () => {
    if (!canSubmit || !userId) return;
    setSaving(true);
    setFormError(null);
    // Every key here is one the API knows — an unknown key is a 422, so this
    // must never grow into a spread of the whole row. sort_order is left out
    // on edit: an absent key means unchanged, and reordering is its own thing.
    const body = {
      job_title: draft.jobTitle.trim(),
      company: draft.company.trim(),
      from_month: draft.from,
      // null is Present. Never '' — the API rejects an empty string with a
      // 422, and an untouched <input type="month"> hands us exactly that.
      to_month: draft.present ? null : draft.to || null,
      responsibility: draft.responsibility.trim(),
    };
    try {
      if (editingId) {
        const updated = await team.experience.update(
          companyId,
          userId,
          editingId,
          body,
        );
        onExperiencesChange(
          experiences.map((e) => (e.id === editingId ? updated : e)),
        );
        setEditingId(null);
      } else {
        const created = await team.experience.create(companyId, userId, {
          ...body,
          sort_order: experiences.length,
        });
        onExperiencesChange([...experiences, created]);
      }
      setDraft(EMPTY_DRAFT);
    } catch (e) {
      setFormError(messageOf(e, 'Could not save that experience.'));
    } finally {
      setSaving(false);
    }
  };

  const removeExperience = async (id: string) => {
    if (!userId) return;
    setFormError(null);
    try {
      await team.experience.remove(companyId, userId, id);
      onExperiencesChange(experiences.filter((e) => e.id !== id));
      // Deleting the row the form is holding would leave it editing a record
      // that no longer exists, and saving would 404.
      if (editingId === id) cancelEdit();
    } catch (e) {
      setFormError(messageOf(e, 'Could not remove that experience.'));
    }
  };

  // The picked file is never kept: readProfilePhoto returns a 4:5, 1000x1250
  // JPEG data URI, so what reaches the API is ~400 KB no matter what came in.
  const pickPhoto = async (f: File | null) => {
    if (!userId) return;
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      if (!f) {
        await team.photo.remove(companyId, userId);
        onPhotoChange(null);
        return;
      }
      const invalid = validatePhotoFile(f);
      if (invalid) {
        setPhotoError(invalid);
        return;
      }
      const dataUri = await readProfilePhoto(f);
      await team.photo.put(companyId, userId, dataUri);
      // Show the bytes we just uploaded rather than round-tripping for a
      // signed URL of the same image. The next roster load replaces it.
      onPhotoChange(dataUri);
    } catch (e) {
      setPhotoError(messageOf(e, 'Could not save that photo.'));
    } finally {
      setPhotoBusy(false);
    }
  };

  const pickCv = async (f: File | null) => {
    if (!userId) return;
    setCvError(null);
    setCvBusy(true);
    try {
      if (!f) {
        await team.cv.remove(companyId, userId);
        setCv(null);
        return;
      }
      // The server checks magic bytes, not the extension. This is only so an
      // obviously wrong pick fails instantly instead of after an upload.
      if (!hasExt(f.name, DOC_EXTS)) {
        setCvError('That file type isn’t supported. Use a PDF or DOCX.');
        return;
      }
      // Re-uploading replaces whatever is there; no DELETE needed first.
      setCv(await team.cv.upload(companyId, userId, f));
    } catch (e) {
      setCvError(messageOf(e, 'Could not upload that CV.'));
    } finally {
      setCvBusy(false);
    }
  };

  // download_url is signed and expires in an hour, so it is re-fetched at click
  // time rather than trusted from whenever the panel happened to open.
  const downloadCv = async () => {
    if (!userId) return;
    setCvError(null);
    try {
      const fresh = await team.cv.get(companyId, userId);
      setCv(fresh);
      window.open(fresh.download_url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setCvError(messageOf(e, 'Could not open that CV.'));
    }
  };

  const photoFilled = photoUri ? (
    <>
      <div className="ob-logo-thumb">
        <img src={photoUri} alt={`${fullName} preview`} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="ob-logo-name">Profile photo</div>
        <div className="ob-logo-meta" style={nowrapStyle}>
          {PHOTO_WIDTH}×{PHOTO_HEIGHT}
        </div>
      </div>
    </>
  ) : null;

  const cvFilled = cv ? (
    <>
      <div className="ob-logo-thumb" style={{ fontSize: 22 }} aria-hidden>
        📄
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="ob-logo-name" title={cv.filename}>
          {cv.filename}
        </div>
        <div className="ob-logo-meta" style={nowrapStyle}>
          {formatBytes(cv.size_bytes)} ·{' '}
          <button type="button" onClick={() => void downloadCv()} style={linkButtonStyle}>
            Download
          </button>
        </div>
      </div>
    </>
  ) : null;

  const experienceForm = (
    <div
      ref={formRef}
      style={{
        background: editingId ? '#F6F6FF' : '#FAFBFE',
        border: `1px solid ${editingId ? '#C7CBF0' : '#ECEEF8'}`,
        borderRadius: 12,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {editingId && (
        <div style={{ fontSize: 11, fontWeight: 700, color: '#4040C8' }}>
          Editing this entry
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <span className="fl-label">
            Job Title <span style={{ color: '#E5484D' }}>*</span>
          </span>
          <input
            className="inp"
            placeholder="Chief Financial Officer"
            value={draft.jobTitle}
            disabled={saving}
            onChange={(e) => setField('jobTitle', e.target.value)}
          />
        </div>
        <div>
          <span className="fl-label">
            Company Name <span style={{ color: '#E5484D' }}>*</span>
          </span>
          <input
            className="inp"
            placeholder="Saudi Aramco"
            value={draft.company}
            disabled={saving}
            onChange={(e) => setField('company', e.target.value)}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <span className="fl-label">
            From <span style={{ color: '#E5484D' }}>*</span>
          </span>
          <input
            className="inp"
            type="month"
            value={draft.from}
            max={draft.to || undefined}
            disabled={saving}
            onChange={(e) => setField('from', e.target.value)}
          />
        </div>
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span className="fl-label" style={{ marginBottom: 5 }}>
              To
            </span>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                fontWeight: 600,
                color: '#5A6080',
                cursor: 'pointer',
                marginBottom: 5,
              }}
            >
              <input
                type="checkbox"
                checked={draft.present}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    present: e.target.checked,
                    to: e.target.checked ? '' : d.to,
                  }))
                }
                style={{ accentColor: '#4040C8', cursor: 'pointer' }}
              />
              Present
            </label>
          </div>
          <input
            className="inp"
            type="month"
            value={draft.to}
            min={draft.from || undefined}
            disabled={draft.present || saving}
            onChange={(e) => setField('to', e.target.value)}
            style={
              draft.present
                ? { background: '#F5F6FB', color: '#9BA3C4', cursor: 'not-allowed' }
                : undefined
            }
          />
        </div>
      </div>

      <div>
        <span className="fl-label">Job &amp; Responsibility</span>
        <textarea
          className="inp"
          rows={3}
          placeholder="Led the finance function across 12 markets; owned the annual audit…"
          value={draft.responsibility}
          disabled={saving}
          onChange={(e) => setField('responsibility', e.target.value)}
          style={{ resize: 'vertical', minHeight: 72, fontFamily: 'inherit' }}
        />
      </div>

      {formError && (
        <div role="alert" style={errorStyle}>
          {formError}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {editingId && (
          <button
            type="button"
            onClick={cancelEdit}
            disabled={saving}
            style={{
              padding: '9px 18px',
              fontSize: 12,
              fontWeight: 600,
              color: '#5A6080',
              background: '#fff',
              border: '1.5px solid #E2E4F0',
              borderRadius: 10,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={() => void submitExperience()}
          disabled={!canSubmit}
          style={{
            padding: '9px 18px',
            fontSize: 12,
            fontWeight: 700,
            color: '#fff',
            background: '#4040C8',
            border: 'none',
            borderRadius: 10,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            opacity: canSubmit ? 1 : 0.55,
            boxShadow: canSubmit ? '0 3px 10px rgba(64,64,200,.25)' : 'none',
          }}
        >
          {saving ? 'Saving…' : editingId ? 'Save changes' : '+ Add Experience'}
        </button>
      </div>
    </div>
  );

  const columnCount = canEdit ? 4 : 3;

  const experienceTable = (
    <div style={{ border: '1px solid #E2E4F0', borderRadius: 12, overflow: 'hidden' }}>
      <table className="utable">
        <thead>
          <tr>
            <th>Job Title</th>
            <th>Company</th>
            <th style={{ width: 170 }}>Period</th>
            {canEdit && <th style={{ width: 84 }} />}
          </tr>
        </thead>
        <tbody>
          {experiences.length === 0 ? (
            <tr>
              <td
                colSpan={columnCount}
                style={{
                  padding: '22px 16px',
                  textAlign: 'center',
                  fontSize: 12,
                  color: '#9BA3C4',
                }}
              >
                No experience added yet.
              </td>
            </tr>
          ) : (
            experiences.map((e) => {
              const hasProse = e.responsibility.length > 0;
              const open = expandedRows[e.id] ?? false;
              const noRule = hasProse ? { borderBottom: 'none' as const } : undefined;
              return (
                // Two <tr> per entry, matching AdminUsersPage's RowGroup idiom:
                // the facts stay on one scannable line and the prose gets the
                // full width underneath, so a pasted job description can no
                // longer stretch the row to 600px.
                <Fragment key={e.id}>
                  <tr
                    className="urow"
                    style={editingId === e.id ? { background: '#F6F6FF' } : undefined}
                  >
                    <td style={{ fontWeight: 700, ...noRule }}>{e.job_title}</td>
                    <td style={noRule}>{e.company}</td>
                    <td style={{ color: '#5A6080', whiteSpace: 'nowrap', ...noRule }}>
                      {periodOf(e)}
                    </td>
                    {canEdit && (
                      <td style={noRule}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="ob-logo-remove"
                            onClick={() => startEdit(e)}
                            aria-label={`Edit ${e.job_title} at ${e.company}`}
                            title="Edit"
                            style={{
                              width: 26,
                              height: 26,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              ...(editingId === e.id
                                ? { borderColor: '#4040C8', color: '#4040C8' }
                                : null),
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                              <path
                                d="M9.6 1.9a1.3 1.3 0 0 1 1.9 0l.6.6a1.3 1.3 0 0 1 0 1.9l-6.3 6.3-2.9.7.7-2.9 6-6.6Z"
                                stroke="currentColor"
                                strokeWidth="1.3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="ob-logo-remove"
                            onClick={() => void removeExperience(e.id)}
                            aria-label={`Remove ${e.job_title} at ${e.company}`}
                            title="Remove"
                            style={{ width: 26, height: 26 }}
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                  {hasProse && (
                    <tr className="urow">
                      <td colSpan={columnCount} style={{ paddingTop: 0 }}>
                        {/* Markdown, because people paste CV text straight out
                            of a job description. Raw HTML in the source is
                            escaped, not rendered: react-markdown only emits
                            elements it builds itself unless rehype-raw is
                            added, which it deliberately is not. */}
                        <div
                          className="md-prose md-tight"
                          style={open ? expandedStyle : clampStyle}
                        >
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {e.responsibility}
                          </ReactMarkdown>
                        </div>
                        {isLongProse(e.responsibility) && (
                          <button
                            type="button"
                            onClick={() => toggleRow(e.id)}
                            style={{ ...linkButtonStyle, marginTop: 5, fontSize: 11 }}
                          >
                            {open ? 'Show less' : 'Show more'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );

  // Deliberately no backdrop-click dismissal, unlike the app's other
  // .modal-overlay screens. This one holds an unsaved experience draft until
  // Add Experience is pressed, and a stray click on the backdrop would discard
  // it with no warning. Escape, the close X and Done are the ways out.
  return (
    <div className="modal-overlay">
      <div
        className="modal-content"
        // maxWidth overrides .modal-content's 96vw cap: at 96vw the panel ate
        // the backdrop on a narrow window, leaving no room to click outside.
        style={{ width: 760, maxWidth: '92vw', padding: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label={`${fullName} profile`}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <div
          style={{
            padding: '20px 24px 18px',
            borderBottom: '1px solid #ECEEF8',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 14,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              flexShrink: 0,
              overflow: 'hidden',
              background: photoUri ? '#fff' : gradientFor(person.id),
              border: photoUri ? '1px solid #E2E4F0' : 'none',
              color: '#fff',
              fontWeight: 800,
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {photoUri ? (
              <img
                src={photoUri}
                alt={`${fullName} profile photo`}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              initialsOf(fullName) || '?'
            )}
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: '#1A1D2E',
                letterSpacing: '-.3px',
              }}
            >
              {fullName}
            </div>
            {person.role && (
              <div style={{ fontSize: 12, color: '#5A6080', marginTop: 2 }}>
                {person.role}
              </div>
            )}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                marginTop: 8,
              }}
            >
              <span className={positionBadgeClass} style={badgeStyle}>
                {positionLabel}
              </span>
              <span className={STATUS_BADGE[person.status]} style={badgeStyle}>
                {STATUS_LABEL[person.status]}
              </span>
              {!canEdit && (
                <span className="b-gy" style={badgeStyle}>
                  View only
                </span>
              )}
              {companyName && (
                <span style={{ fontSize: 11, color: '#9BA3C4' }}>{companyName}</span>
              )}
              {person.email && (
                <span style={{ fontSize: 11, color: '#9BA3C4' }} title={person.email}>
                  {person.email}
                </span>
              )}
            </div>
            {person.bio && (
              <p
                style={{
                  fontSize: 11.5,
                  color: '#5A6080',
                  lineHeight: 1.55,
                  margin: '10px 0 0',
                  maxWidth: '62ch',
                }}
              >
                {person.bio}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: '1.5px solid #E2E4F0',
              background: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#5A6080',
              flexShrink: 0,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path
                d="M2 2l7 7M9 2l-7 7"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* ── Photo + CV ──────────────────────────────────────────── */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #ECEEF8' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ minWidth: 0 }}>
              <span className="fl-label">Profile Photo</span>
              {canEdit ? (
                <BrandUploadBox
                  icon="🖼️"
                  prompt="Drag a photo here"
                  hint="JPG or PNG · up to 5 MB"
                  accept={PHOTO_ACCEPT}
                  error={photoError ?? undefined}
                  busy={photoBusy || loading}
                  busyLabel={loading ? 'Loading…' : 'Preparing your photo…'}
                  removeLabel="Remove photo"
                  onPick={(f) => void pickPhoto(f)}
                  filled={photoFilled}
                />
              ) : (
                <>
                  <ReadOnlyBox empty="No photo uploaded" loading={loading} filled={photoFilled} />
                  {photoError && <div className="fl-err">{photoError}</div>}
                </>
              )}
            </div>

            <div style={{ minWidth: 0 }}>
              <span className="fl-label">CV / Résumé</span>
              {canEdit ? (
                <BrandUploadBox
                  icon="📄"
                  prompt="Drag a CV here"
                  hint="PDF or DOCX · up to 10 MB"
                  accept={DOC_ACCEPT}
                  error={cvError ?? undefined}
                  busy={cvBusy || loading}
                  busyLabel={loading ? 'Loading…' : 'Uploading…'}
                  removeLabel="Remove CV"
                  onPick={(f) => void pickCv(f)}
                  filled={cvFilled}
                />
              ) : (
                <>
                  <ReadOnlyBox empty="No CV uploaded" loading={loading} filled={cvFilled} />
                  {cvError && <div className="fl-err">{cvError}</div>}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Experience ──────────────────────────────────────────── */}
        <div style={{ padding: '18px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <span style={sectionTitleStyle}>Experience</span>
            <span className="uhead-count">{experiences.length}</span>
          </div>

          {/* Once there is something to show, the list leads and the form drops
              underneath as the "add another" step. With nothing added yet the
              order flips: an empty table above an empty form says nothing, so
              the form comes first. Reordered in the DOM rather than with CSS
              `order`, so tab order still follows what is on screen. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {experiences.length > 0 ? (
              <>
                {experienceTable}
                {canEdit && experienceForm}
              </>
            ) : (
              <>
                {canEdit && experienceForm}
                {experienceTable}
              </>
            )}
            {!canEdit && formError && (
              <div role="alert" style={errorStyle}>
                {formError}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <div
          style={{
            padding: '14px 24px 18px',
            borderTop: '1px solid #ECEEF8',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 18px',
              fontSize: 12,
              fontWeight: 700,
              color: '#fff',
              background: '#4040C8',
              border: 'none',
              borderRadius: 10,
              cursor: 'pointer',
              boxShadow: '0 3px 10px rgba(64,64,200,.25)',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// The view-only counterpart to BrandUploadBox's filled row — the same .ob-*
// shell and height, minus Replace and the remove button.
function ReadOnlyBox({
  filled,
  empty,
  loading,
}: {
  filled: React.ReactNode;
  empty: string;
  loading: boolean;
}) {
  if (filled) return <div className="ob-logo-preview">{filled}</div>;
  return (
    <div
      className="ob-logo-preview"
      style={{ minHeight: 78, color: '#9BA3C4', fontSize: 12, fontWeight: 600 }}
    >
      {loading ? 'Loading…' : empty}
    </div>
  );
}
