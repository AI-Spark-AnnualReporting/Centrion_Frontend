import { Fragment, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import BrandUploadBox from '@/components/brand/BrandUploadBox';
import { DOC_ACCEPT, dataUriBytes, formatBytes } from '@/types/brand';
import {
  PHOTO_ACCEPT,
  PHOTO_HEIGHT,
  PHOTO_WIDTH,
  readProfilePhoto,
  validatePhotoFile,
} from '@/lib/image';
import { gradientFor, initialsOf } from '@/lib/avatar';

// Frontend-only for now: nothing here is posted anywhere. These shapes are what
// the backend will be modelled on, so keep them flat and serialisable — the
// photo is a data URI rather than a File so a future PATCH can send it inline
// the way companies.logo_base64 already does.
export interface Experience {
  id: string;
  jobTitle: string;
  company: string;
  from: string; // 'YYYY-MM' straight off <input type="month">
  to: string; // 'YYYY-MM', or '' meaning Present
  responsibility: string;
}

export interface MemberProfile {
  photoUri?: string;
  cvName?: string;
  cvSize?: number;
  experiences: Experience[];
}

// What the modal needs off a person. Structurally satisfied by the Person view
// model in StakeholdersPage without importing it — this file stays reusable if
// the roster ever renders somewhere else.
interface ProfilePerson {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  email: string;
  bio: string;
  status: 'active' | 'inactive' | 'pending';
}

interface MemberProfileModalProps {
  person: ProfilePerson;
  companyName: string;
  positionLabel: string;
  positionBadgeClass: string;
  profile: MemberProfile;
  onChange: (next: MemberProfile) => void;
  onClose: () => void;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// 'YYYY-MM' → 'Mar 2019'. date-fns would need a Date, and constructing one from
// a month string reintroduces the timezone-off-by-one this format exists to
// avoid — so parse the two numbers directly.
function formatMonth(value: string): string {
  const [y, m] = value.split('-');
  const idx = Number(m) - 1;
  if (!y || Number.isNaN(idx) || idx < 0 || idx > 11) return value;
  return `${MONTHS[idx]} ${y}`;
}

function periodOf(e: Experience): string {
  return `${formatMonth(e.from)} — ${e.to ? formatMonth(e.to) : 'Present'}`;
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

// Whether the clamp can actually bite. Measuring the rendered box would be
// exact but costs a layout pass and a ref per row; at roughly 90 characters a
// line across the full panel width, anything past three lines' worth - or with
// its own line breaks - is safely a "Show more" candidate.
function isLongProse(text: string): boolean {
  return text.length > 270 || text.includes('\n');
}

const nowrapStyle = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

const sectionTitleStyle = {
  fontSize: 12,
  fontWeight: 800,
  color: '#1A1D2E',
  letterSpacing: '-.1px',
} as const;

export default function MemberProfileModal({
  person,
  companyName,
  positionLabel,
  positionBadgeClass,
  profile,
  onChange,
  onClose,
}: MemberProfileModalProps) {
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [cvError, setCvError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  // Escape closes, since the backdrop deliberately does not.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleRow = (id: string) =>
    setExpandedRows((r) => ({ ...r, [id]: !r[id] }));

  const fullName = [person.firstName, person.lastName].filter(Boolean).join(' ');
  const experiences = profile.experiences;

  const setField = <K extends keyof DraftState>(key: K, value: DraftState[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const canAdd =
    draft.jobTitle.trim().length > 0 &&
    draft.company.trim().length > 0 &&
    draft.from.length > 0;

  const addExperience = () => {
    if (!canAdd) return;
    onChange({
      ...profile,
      experiences: [
        ...experiences,
        {
          id: crypto.randomUUID(),
          jobTitle: draft.jobTitle.trim(),
          company: draft.company.trim(),
          from: draft.from,
          to: draft.present ? '' : draft.to,
          responsibility: draft.responsibility.trim(),
        },
      ],
    });
    setDraft(EMPTY_DRAFT);
  };

  const removeExperience = (id: string) =>
    onChange({ ...profile, experiences: experiences.filter((e) => e.id !== id) });

  // The picked file is never kept: readProfilePhoto returns a 4:5, 1000x1250
  // JPEG data URI, so what lands in state is ~400 KB no matter what came in.
  const pickPhoto = async (f: File | null) => {
    if (!f) {
      setPhotoError(null);
      setPhotoBusy(false);
      onChange({ ...profile, photoUri: undefined });
      return;
    }
    const invalid = validatePhotoFile(f);
    if (invalid) {
      setPhotoError(invalid);
      return;
    }
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      onChange({ ...profile, photoUri: await readProfilePhoto(f) });
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Could not read that image.');
    } finally {
      setPhotoBusy(false);
    }
  };

  // Only the name and size are kept: there is no endpoint to send the bytes to
  // yet, and holding the File alive buys nothing but memory.
  const pickCv = (f: File | null) => {
    if (!f) {
      setCvError(null);
      onChange({ ...profile, cvName: undefined, cvSize: undefined });
      return;
    }
    if (!/\.(pdf|docx?)$/i.test(f.name)) {
      setCvError('That file type isn’t supported. Use a PDF or DOCX.');
      return;
    }
    setCvError(null);
    onChange({ ...profile, cvName: f.name, cvSize: f.size });
  };

  const experienceForm = (
    <div
      style={{
        background: '#FAFBFE',
        border: '1px solid #ECEEF8',
        borderRadius: 12,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <span className="fl-label">
            Job Title <span style={{ color: '#E5484D' }}>*</span>
          </span>
          <input
            className="inp"
            placeholder="Chief Financial Officer"
            value={draft.jobTitle}
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
            disabled={draft.present}
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
          onChange={(e) => setField('responsibility', e.target.value)}
          style={{ resize: 'vertical', minHeight: 72, fontFamily: 'inherit' }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={addExperience}
          disabled={!canAdd}
          style={{
            padding: '9px 18px',
            fontSize: 12,
            fontWeight: 700,
            color: '#fff',
            background: '#4040C8',
            border: 'none',
            borderRadius: 10,
            cursor: canAdd ? 'pointer' : 'not-allowed',
            opacity: canAdd ? 1 : 0.55,
            boxShadow: canAdd ? '0 3px 10px rgba(64,64,200,.25)' : 'none',
          }}
        >
          + Add Experience
        </button>
      </div>
    </div>
  );

  const experienceTable = (
    <div
      style={{
        border: '1px solid #E2E4F0',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <table className="utable">
        <thead>
          <tr>
            <th>Job Title</th>
            <th>Company</th>
            <th style={{ width: 170 }}>Period</th>
            <th style={{ width: 44 }} />
          </tr>
        </thead>
        <tbody>
          {experiences.length === 0 ? (
            <tr>
              <td
                colSpan={4}
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
              const noRule = hasProse
                ? { borderBottom: 'none' as const }
                : undefined;
              return (
                // Two <tr> per entry, matching AdminUsersPage's RowGroup
                // idiom: the facts stay on one scannable line and the
                // prose gets the full width underneath, so a pasted job
                // description can no longer stretch the row to 600px.
                <Fragment key={e.id}>
                  <tr className="urow">
                    <td style={{ fontWeight: 700, ...noRule }}>
                      {e.jobTitle}
                    </td>
                    <td style={noRule}>{e.company}</td>
                    <td
                      style={{
                        color: '#5A6080',
                        whiteSpace: 'nowrap',
                        ...noRule,
                      }}
                    >
                      {periodOf(e)}
                    </td>
                    <td style={noRule}>
                      <button
                        type="button"
                        className="ob-logo-remove"
                        onClick={() => removeExperience(e.id)}
                        aria-label={`Remove ${e.jobTitle} at ${e.company}`}
                        style={{ width: 26, height: 26 }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                  {hasProse && (
                    <tr className="urow">
                      <td colSpan={4} style={{ paddingTop: 0 }}>
                        {/* Markdown, because people paste CV text
                            straight out of a job description. Raw HTML
                            in the source is escaped, not rendered:
                            react-markdown only emits elements it builds
                            itself unless rehype-raw is added, which it
                            deliberately is not. */}
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
                            style={{
                              marginTop: 5,
                              padding: 0,
                              border: 'none',
                              background: 'none',
                              color: '#4040C8',
                              fontSize: 11,
                              fontWeight: 700,
                              fontFamily: 'inherit',
                              cursor: 'pointer',
                            }}
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
              background: profile.photoUri ? '#fff' : gradientFor(person.id),
              border: profile.photoUri ? '1px solid #E2E4F0' : 'none',
              color: '#fff',
              fontWeight: 800,
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {profile.photoUri ? (
              <img
                src={profile.photoUri}
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
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}
          >
            <div style={{ minWidth: 0 }}>
              <span className="fl-label">Profile Photo</span>
              <BrandUploadBox
                icon="🖼️"
                prompt="Drag a photo here"
                hint="JPG or PNG · up to 5 MB"
                accept={PHOTO_ACCEPT}
                error={photoError ?? undefined}
                busy={photoBusy}
                busyLabel="Preparing your photo…"
                removeLabel="Remove photo"
                onPick={(f) => void pickPhoto(f)}
                filled={
                  profile.photoUri && (
                    <>
                      <div className="ob-logo-thumb">
                        <img src={profile.photoUri} alt={`${fullName} preview`} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="ob-logo-name">Profile photo</div>
                        <div className="ob-logo-meta" style={nowrapStyle}>
                          {PHOTO_WIDTH}×{PHOTO_HEIGHT} &middot;{' '}
                          {formatBytes(dataUriBytes(profile.photoUri))}
                        </div>
                      </div>
                    </>
                  )
                }
              />
            </div>

            <div style={{ minWidth: 0 }}>
              <span className="fl-label">CV / Résumé</span>
              <BrandUploadBox
                icon="📄"
                prompt="Drag a CV here"
                hint="PDF or DOCX"
                accept={DOC_ACCEPT}
                error={cvError ?? undefined}
                removeLabel="Remove CV"
                onPick={pickCv}
                filled={
                  profile.cvName && (
                    <>
                      <div className="ob-logo-thumb" style={{ fontSize: 22 }} aria-hidden>
                        📄
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="ob-logo-name" title={profile.cvName}>
                          {profile.cvName}
                        </div>
                        <div className="ob-logo-meta" style={nowrapStyle}>
                          {formatBytes(profile.cvSize ?? 0)}
                        </div>
                      </div>
                    </>
                  )
                }
              />
            </div>
          </div>
        </div>

        {/* ── Experience ──────────────────────────────────────────── */}
        <div style={{ padding: '18px 24px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <span style={sectionTitleStyle}>Experience</span>
            <span className="uhead-count">{experiences.length}</span>
          </div>

          {/* Once there is something to show, the list leads and the form
              drops underneath as the "add another" step. With nothing added
              yet the order flips: an empty table above an empty form says
              nothing, so the form comes first. Reordered in the DOM rather
              than with CSS `order`, so tab order still follows what is on
              screen. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {experiences.length > 0 ? (
              <>
                {experienceTable}
                {experienceForm}
              </>
            ) : (
              <>
                {experienceForm}
                {experienceTable}
              </>
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
