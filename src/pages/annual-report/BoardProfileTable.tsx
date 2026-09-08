// Board report · step 3 — the people behind BR32, when they came from a CV file.
//
// The generic cell editor (EditableSectionContent) edits the RENDERED grid,
// which the next produce rebuilds from scratch. That is fine for a section whose
// rows are the content; it is wrong here, because BR32's rows are built from
// people — so an edit made there would not survive a re-produce, could not add
// or delete a person, and has nowhere to put a headshot.
//
// This edits the people instead. One PUT carries the whole table: leaving a
// person out deletes them, a row with no id adds one, a changed row is an edit,
// and a headshot rides along as `photo_base64`. Saving then re-produces BR32 so
// the printed grid catches up.
//
// A CV rarely carries a usable photograph, which is why the picture is a field
// the operator fills rather than something the extraction is expected to find.
// That is exactly why the empty state is a placeholder with a named "Upload
// picture" action rather than a file field: a director with no face is the
// NORMAL outcome of an upload, and the person reading this screen has to be
// told so on the row, not left to discover a control.

import { useCallback, useEffect, useRef, useState } from 'react';
import { boardReports } from '@/lib/api';
import { Spinner } from '@/components/shared/Spinner';
import { LOGO_ACCEPT, readLogoFile, validateLogoFile } from '@/types/brand';
import type { BoardProfile, BoardProfileJob } from '@/types/board';
import { errorMessage } from './board-helpers';
import { ACCENT, BORDER, BORDER_SOFT, FAINT, INK, MONO, MUTED, RED } from './board-ui';

/** Mirrors the server's caps, so the operator hears about one before the PUT. */
const MAX_PROFILES = 40;
const MAX_JOBS = 20;

const emptyJob = (): BoardProfileJob => ({
  job_title: '',
  company: '',
  from_month: null,
  to_month: null,
  responsibility: '',
});

const emptyProfile = (): BoardProfile => ({
  full_name: '',
  title: '',
  experience: [emptyJob()],
});

/**
 * A date bound as the field shows it.
 *
 * Plain text, not `<input type="month">`: CVs are written in years — "moved to
 * Dubai in 2007, retired in 2019" — and the API keeps a bare "2007" for exactly
 * that reason, which a month input cannot hold or even display. It would show
 * blank and quietly drop the year on the next save.
 */
const monthValue = (v: string | null | undefined): string => v ?? '';

/** Empty means "not stated", which the API spells `null`, not `""`. */
const monthOrNull = (v: string): string | null => (v.trim() ? v : null);

/** What the API keeps: a month, or a year on its own. Mirrors _month(). */
const DATE_SHAPE = /^\d{4}(-(0[1-9]|1[0-2]))?$/;

/** Typed but unusable — the server would store null and the year would vanish. */
const badDate = (v: string | null | undefined): boolean =>
  !!v && v.trim() !== '' && !DATE_SHAPE.test(v.trim());

/** Replace one item in a list without mutating it. */
function replaceAt<T>(list: T[], index: number, next: T): T[] {
  return list.map((item, i) => (i === index ? next : item));
}

export default function BoardProfileTable({
  reportId,
  sectionCode,
  disabled,
  onSaved,
  onCancel,
}: {
  reportId: string;
  sectionCode: string;
  disabled: boolean;
  /** Saved — the page re-produces BR32 and closes the editor. */
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [profiles, setProfiles] = useState<BoardProfile[] | null>(null);
  const [sourceFiles, setSourceFiles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await boardReports.getSectionProfiles(reportId, sectionCode);
      setProfiles(data.profiles);
      setSourceFiles(data.documents.map((d) => d.filename));
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not load the board member profiles.'));
      setProfiles([]);
    }
  }, [reportId, sectionCode]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = (index: number, next: BoardProfile) =>
    setProfiles((list) => (list ? replaceAt(list, index, next) : list));

  const removeProfile = (index: number) =>
    setProfiles((list) => (list ? list.filter((_, i) => i !== index) : list));

  const addProfile = () =>
    setProfiles((list) => (list ? [...list, emptyProfile()] : [emptyProfile()]));

  /**
   * Read a picked headshot to the data URI the API takes, or clear it.
   *
   * `null` from the box is the ✕ — and `photo_base64: null` is how the API
   * spells "clear it", which is a different instruction from omitting the key.
   */
  const pickPhoto = async (index: number, profile: BoardProfile, file: File | null) => {
    if (!file) {
      update(index, { ...profile, photo_base64: null, photo_data_uri: null, has_photo: false });
      return;
    }
    const bad = validateLogoFile(file);
    if (bad) {
      setError(bad);
      return;
    }
    setError(null);
    try {
      const picked = await readLogoFile(file);
      // photo_data_uri is what this table draws; photo_base64 is what it sends.
      // Setting both means the row shows the new face before the save lands.
      update(index, {
        ...profile,
        photo_base64: picked.dataUri,
        photo_data_uri: picked.dataUri,
        has_photo: true,
      });
    } catch (err: unknown) {
      setError(errorMessage(err, 'We could not read that image.'));
    }
  };

  const save = async () => {
    if (!profiles) return;
    // Named here rather than left to the 422: the operator is looking at the
    // row, and a round trip to be told which one is empty helps nobody.
    const blank = profiles.findIndex((p) => !p.full_name.trim());
    if (blank >= 0) {
      setError(`Person ${blank + 1} has no name. Every row needs one, or remove the row.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await boardReports.setSectionProfiles(reportId, sectionCode, profiles);
      onSaved();
    } catch (err: unknown) {
      // Nothing is written unless every row validates, so the table on screen is
      // still exactly what is saved — leave it alone and let them fix it.
      setError(errorMessage(err, 'Could not save these profiles.'));
    } finally {
      setSaving(false);
    }
  };

  if (!profiles) return <Spinner pad={28} />;

  const full = profiles.length >= MAX_PROFILES;

  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          padding: '10px 13px',
          borderBottom: `1px solid ${BORDER_SOFT}`,
          background: '#FAFBFE',
        }}
      >
        <span style={{ fontSize: 11.5, fontWeight: 700, color: INK }}>
          Board members in this section
        </span>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: ACCENT }}>
          {profiles.length}
        </span>
        {sourceFiles.length > 0 && (
          <span style={{ fontSize: 11, color: FAINT }} title={sourceFiles.join(', ')}>
            read from {sourceFiles[0]}
            {sourceFiles.length > 1 && ` + ${sourceFiles.length - 1} more`}
          </span>
        )}
      </div>

      <div style={{ padding: '11px 13px', fontSize: 11.5, color: MUTED, borderBottom: `1px solid ${BORDER_SOFT}` }}>
        These were read out of the uploaded CV, so check them before the report goes out.
        Correct anything that came through wrong, add someone the file missed, remove anyone who
        does not belong — and add a photograph, which a CV rarely carries.
      </div>

      {error && (
        <div style={{ padding: '9px 13px', fontSize: 11.5, color: RED, borderBottom: `1px solid ${BORDER_SOFT}` }}>
          {error}
        </div>
      )}

      {profiles.length === 0 ? (
        <div style={{ padding: '18px 13px', fontSize: 12, color: MUTED }}>
          Nobody was read out of the uploaded file. Add the board members by hand below, or go
          back to Sources and upload a different CV.
        </div>
      ) : (
        profiles.map((profile, index) => (
          <ProfileRow
            key={profile.id ?? `new-${index}`}
            profile={profile}
            index={index}
            disabled={disabled || saving}
            onChange={(next) => update(index, next)}
            onRemove={() => removeProfile(index)}
            onPickPhoto={(file) => pickPhoto(index, profile, file)}
          />
        ))
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          padding: '11px 13px',
          background: '#FAFBFE',
        }}
      >
        <button
          className="btn bs bsm"
          type="button"
          disabled={disabled || saving || full}
          title={full ? `At most ${MAX_PROFILES} people per report` : undefined}
          onClick={addProfile}
        >
          + Add a person
        </button>
        <span style={{ flex: 1 }} />
        <button className="btn bs bsm" type="button" disabled={saving} onClick={onCancel}>
          Cancel
        </button>
        <button className="btn bp bsm" type="button" disabled={disabled || saving} onClick={save}>
          {saving ? 'Saving…' : 'Save and rebuild the section'}
        </button>
      </div>
    </div>
  );
}

// ─── one director's photograph ───────────────────────────────────────────────
//
// Two states, and the empty one is the point. A CV almost never carries a usable
// portrait, so "no picture" is what an upload normally produces — the row has to
// say so and offer the fix in the same breath, rather than showing a file field
// and leaving the operator to work out that it is theirs to fill.
//
// The avatar is the same 56px square either way, so nothing on the row moves
// when a picture lands.

const AVATAR = 56;

/** The muted figure drawn where a director has no photograph yet. */
const PERSON_GLYPH = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="8" r="3.6" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M4.8 20c0-3.6 3.2-5.8 7.2-5.8s7.2 2.2 7.2 5.8"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

function PhotoCell({
  profile,
  disabled,
  onPick,
}: {
  profile: BoardProfile;
  disabled: boolean;
  onPick: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const photo = profile.photo_data_uri;
  const who = profile.full_name || 'this board member';

  const open = () => {
    if (!disabled) inputRef.current?.click();
  };

  const action = {
    display: 'block',
    width: '100%',
    marginTop: 6,
    padding: '4px 6px',
    fontFamily: 'inherit' as const,
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1.3,
    borderRadius: 6,
    border: '1px solid transparent',
    background: 'none',
    color: ACCENT,
    cursor: disabled ? 'default' : 'pointer',
  };

  return (
    <>
      {/* The avatar is itself the target in both states, so the whole cell is
          one thing to hit rather than a picture beside a separate control. */}
      <button
        type="button"
        onClick={open}
        disabled={disabled}
        aria-label={photo ? `Change the photo of ${who}` : `Upload a photo of ${who}`}
        title={photo ? 'Change this photo' : 'Upload a photo'}
        style={{
          width: AVATAR,
          height: AVATAR,
          padding: 0,
          borderRadius: 10,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: disabled ? 'default' : 'pointer',
          border: photo ? `1px solid ${BORDER}` : `1.5px dashed ${BORDER}`,
          background: photo ? '#fff' : '#FAFBFE',
          color: FAINT,
        }}
      >
        {photo ? (
          <img
            src={photo}
            alt={profile.full_name || 'Board member'}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          PERSON_GLYPH
        )}
      </button>

      {photo ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button type="button" style={action} onClick={open} disabled={disabled}>
            ✏ Edit
          </button>
          <button
            type="button"
            onClick={() => !disabled && onPick(null)}
            disabled={disabled}
            aria-label={`Remove the photo of ${who}`}
            title="Remove this photo"
            style={{ ...action, width: 'auto', color: FAINT, fontWeight: 600 }}
          >
            ✕
          </button>
        </div>
      ) : (
        // Named, and on the row. Hiding this behind the avatar would leave a
        // director with no face and nothing saying it was ever an option.
        <button type="button" style={action} onClick={open} disabled={disabled}>
          Upload picture
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={LOGO_ACCEPT}
        style={{ display: 'none' }}
        onChange={(e) => {
          onPick(e.target.files?.[0] ?? null);
          e.target.value = ''; // re-picking the same file must still fire onChange
        }}
      />
    </>
  );
}


// ─── one person ───────────────────────────────────────────────────────────────

function ProfileRow({
  profile,
  index,
  disabled,
  onChange,
  onRemove,
  onPickPhoto,
}: {
  profile: BoardProfile;
  index: number;
  disabled: boolean;
  onChange: (next: BoardProfile) => void;
  onRemove: () => void;
  onPickPhoto: (file: File | null) => void;
}) {
  const jobs = profile.experience ?? [];

  const setJob = (jobIndex: number, next: BoardProfileJob) =>
    onChange({ ...profile, experience: replaceAt(jobs, jobIndex, next) });

  const removeJob = (jobIndex: number) =>
    onChange({ ...profile, experience: jobs.filter((_, i) => i !== jobIndex) });

  const addJob = () => onChange({ ...profile, experience: [...jobs, emptyJob()] });

  const field = {
    fontSize: 12,
    padding: '6px 8px',
    width: '100%',
    border: `1px solid ${BORDER}`,
    borderRadius: 7,
    fontFamily: 'inherit' as const,
    color: INK,
    background: '#fff',
  };

  const label = { fontSize: 10.5, fontWeight: 700, color: FAINT, marginBottom: 3, display: 'block' };

  // A date the server would refuse is marked in the field rather than accepted
  // and silently stored as "not stated" — losing a date to a typo is the kind
  // of edit nobody notices until the report is out.
  const dateField = (v: string | null | undefined) =>
    (badDate(v) ? { ...field, borderColor: RED } : field);

  return (
    <div className="bpt-person" style={{ padding: '14px 13px', borderBottom: `1px solid ${BORDER_SOFT}` }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ width: 96, flexShrink: 0 }}>
          <span style={label}>Photo</span>
          <PhotoCell profile={profile} disabled={disabled} onPick={onPickPhoto} />
        </div>

        {/* minWidth 0, not 240: a flex item defaults to min-content, so one
            long director name would otherwise widen the whole row rather than
            wrapping inside it. */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <span style={label}>Name</span>
              <input
                style={field}
                value={profile.full_name}
                disabled={disabled}
                placeholder="Fatima Al-Rashid"
                onChange={(e) => onChange({ ...profile, full_name: e.target.value })}
              />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              {/* Their role on the BOARD. Their current job is an entry below —
                  the two are different facts and the report prints both. */}
              <span style={label}>Board title</span>
              <input
                style={field}
                value={profile.title}
                disabled={disabled}
                placeholder="Independent Non-Executive Director"
                onChange={(e) => onChange({ ...profile, title: e.target.value })}
              />
            </div>
          </div>

          {jobs.map((job, jobIndex) => (
            <div
              key={jobIndex}
              style={{
                marginTop: 10,
                padding: '10px 11px',
                border: `1px solid ${BORDER_SOFT}`,
                borderRadius: 8,
                background: '#FAFBFE',
              }}
            >
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <span style={label}>Job title</span>
                  <input
                    style={field}
                    value={job.job_title}
                    disabled={disabled}
                    onChange={(e) => setJob(jobIndex, { ...job, job_title: e.target.value })}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <span style={label}>Company</span>
                  <input
                    style={field}
                    value={job.company}
                    disabled={disabled}
                    onChange={(e) => setJob(jobIndex, { ...job, company: e.target.value })}
                  />
                </div>
                <div style={{ width: 132 }}>
                  <span style={label}>From</span>
                  <input
                    style={dateField(job.from_month)}
                    value={monthValue(job.from_month)}
                    disabled={disabled}
                    placeholder="2007-03 or 2007"
                    aria-label="From — year, or year and month"
                    onChange={(e) => setJob(jobIndex, { ...job, from_month: monthOrNull(e.target.value) })}
                  />
                </div>
                <div style={{ width: 132 }}>
                  {/* Empty is not missing data — it is the job they still hold,
                      which is what the report prints as "present". */}
                  <span style={label}>To — blank if current</span>
                  <input
                    style={dateField(job.to_month)}
                    value={monthValue(job.to_month)}
                    disabled={disabled}
                    placeholder="2019-06 or 2019"
                    aria-label="To — year, or year and month; blank if current"
                    onChange={(e) => setJob(jobIndex, { ...job, to_month: monthOrNull(e.target.value) })}
                  />
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                <span style={label}>What they did</span>
                <textarea
                  style={{ ...field, minHeight: 54, resize: 'vertical' }}
                  value={job.responsibility}
                  disabled={disabled}
                  onChange={(e) => setJob(jobIndex, { ...job, responsibility: e.target.value })}
                />
              </div>
              <button
                className="btn bs bsm"
                type="button"
                disabled={disabled}
                style={{ marginTop: 8 }}
                onClick={() => removeJob(jobIndex)}
              >
                Remove this job
              </button>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button
              className="btn bs bsm"
              type="button"
              disabled={disabled || jobs.length >= MAX_JOBS}
              title={jobs.length >= MAX_JOBS ? `At most ${MAX_JOBS} jobs per person` : undefined}
              onClick={addJob}
            >
              + Add a job
            </button>
            <span style={{ flex: 1 }} />
            <button className="btn bs bsm" type="button" disabled={disabled} onClick={onRemove}>
              Remove {profile.full_name.trim() || `person ${index + 1}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
