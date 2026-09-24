export type MeetingType =
  | 'investor_call'
  | 'board_meeting'
  | 'esg_briefing'
  | 'roadshow'
  | 'one_on_one'
  | (string & {});

export type MeetingPlatform =
  | 'zoom'
  | 'teams'
  | 'google_meet'
  | 'in_person'
  | (string & {});

export type MeetingStatus = 'scheduled' | 'cancelled' | 'completed' | (string & {});

export interface Meeting {
  id: string;
  user_id: string;
  title: string;
  meeting_date: string; // YYYY-MM-DD
  meeting_time: string; // HH:mm:ss
  meeting_type: MeetingType;
  platform: MeetingPlatform;
  participants: string[];
  agenda: string;
  link_or_location?: string | null;
  status: MeetingStatus;
  // Set by the list/get endpoints so the "Needs Minutes" rail can be built from
  // one request rather than one per past meeting. Absent (older backend) reads
  // as "no minutes yet", which is the safe default.
  has_minutes?: boolean;
  created_at: string;
  updated_at: string;
}

export interface MeetingListResponse {
  meetings: Meeting[];
  total: number;
}

export interface MeetingResponse {
  meeting: Meeting;
  // Invitation-email outcome. Worth showing even when true, because the
  // message also reports who was skipped ("1 entry had no email address").
  // Both are null on PATCH when nothing was sent at all — no real change, or
  // the meeting is already completed.
  email_sent?: boolean | null;
  email_message?: string | null;
}

export interface CreateMeetingBody {
  title: string;
  meeting_date: string;
  meeting_time: string;
  meeting_type: MeetingType;
  platform: MeetingPlatform;
  participants: string[];
  agenda: string;
  link_or_location?: string;
}

export type UpdateMeetingBody = Partial<Omit<Meeting, 'created_at' | 'updated_at'>>;

// ── Minutes of meeting ────────────────────────────────────────────────────
// One record per meeting, written after it has happened. The three decision
// fields are free text, not structured lists.

// Attendance is stored as a word, not a flag: `{"a@x.com": "present"}` reads
// on its own in the database and in a payload, and leaves room for a third
// state later without changing the type.
export type AttendanceStatus = 'present' | 'absent';

export interface MeetingMinutes {
  meeting_id: string;
  notes: string;
  decision_taken: string;
  decision_under_review: string;
  decision_abandoned: string;
  // Participant email → attendance. A participant missing from the map has no
  // recorded answer yet; the UI shows those as present.
  //
  // `boolean` is here for records written before the switch to words — read
  // this through a normaliser, never by comparing to a string directly.
  attendance: Record<string, AttendanceStatus | boolean>;
  attachment_name?: string | null;
  // Signed and short-lived (1h), with the download disposition baked in.
  // Re-fetch the record for a fresh one rather than storing this anywhere.
  attachment_url?: string | null;
  // Text the backend read out of the attachment. null with no attachment;
  // "" when the file has no text layer (a scanned PDF). Separate from
  // `notes`, which only ever holds what the user typed.
  attachment_text?: string | null;
  updated_at?: string;
}

// `minutes` is null when nothing has been written for the meeting yet.
export interface MeetingMinutesResponse {
  minutes: MeetingMinutes | null;
}

// The five text fields are a full replace, not a patch — an omitted part is
// stored as "". Always send all of them.
export interface SaveMeetingMinutesBody {
  notes: string;
  decision_taken: string;
  decision_under_review: string;
  decision_abandoned: string;
  // Written strictly as words, whatever shape was read back.
  attendance: Record<string, AttendanceStatus>;
  // A new file to store. Omitted leaves any existing attachment untouched.
  attachment?: File | null;
  // Drop the stored attachment without uploading a replacement.
  remove_attachment?: boolean;
}
