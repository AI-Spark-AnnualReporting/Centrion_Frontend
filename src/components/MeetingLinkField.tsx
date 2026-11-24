import type { MeetingPlatform } from '@/types/meeting';
import { MEETING_LINK_ERROR, normalizeMeetingLink } from '@/lib/meetingLink';

/**
 * The Meeting URL / Location input, shared by the Schedule Meeting popup and the
 * edit form on the Meetings page so both check links the same way. The error
 * sits right under the field. Leaving the field fixes a missing "https://" or
 * shows the error straight away.
 */
export function MeetingLinkField({
  id,
  platform,
  value,
  error,
  onChange,
  onErrorChange,
}: {
  id: string;
  platform: MeetingPlatform;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  onErrorChange: (error: string | null) => void;
}) {
  const isInPerson = platform === 'in_person';
  const errorId = `${id}-error`;

  const handleChange = (next: string) => {
    onChange(next);
    // Typing is the fix, so stop shouting while they type.
    if (error) onErrorChange(null);
  };

  const handleBlur = () => {
    // Empty is reported on Save, not the moment someone tabs past the field.
    if (isInPerson || value.trim() === '') return;
    const cleaned = normalizeMeetingLink(value);
    if (cleaned === null) {
      onErrorChange(MEETING_LINK_ERROR);
      return;
    }
    if (cleaned !== value) onChange(cleaned);
  };

  return (
    <div>
      <label className="fl-label" htmlFor={id}>
        {isInPerson ? 'Location' : 'Meeting URL'} <span style={{ color: '#E5484D' }}>*</span>
      </label>
      <input
        id={id}
        className={error ? 'inp inp-error' : 'inp'}
        type={isInPerson ? 'text' : 'url'}
        inputMode={isInPerson ? 'text' : 'url'}
        maxLength={2048}
        placeholder={isInPerson ? 'Venue / address' : 'https://zoom.us/j/…'}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
      />
      {error && (
        <div id={errorId} role="alert" style={{ fontSize: 11, color: '#DC2626', marginTop: 5 }}>
          {error}
        </div>
      )}
    </div>
  );
}
