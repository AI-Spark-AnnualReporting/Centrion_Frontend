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
