// Meeting links must be real http(s) web addresses (QA audit BM-03). The browser's
// type="url" check never ran (no <form>), and it would accept javascript: anyway.

import { describe, it, expect } from 'vitest';
import {
  MEETING_LINK_ERROR,
  getMeetingLinkError,
  getMeetingLinkToSave,
  isValidMeetingLink,
  normalizeMeetingLink,
} from '@/lib/meetingLink';

describe('normalizeMeetingLink: accepts real meeting links', () => {
  const good = [
    'https://zoom.us/j/123456789',
    'https://us02web.zoom.us/j/8123?pwd=abc',
    'https://teams.microsoft.com/l/meetup-join/19%3ameeting_x/0?context=%7b%7d',
    'https://meet.google.com/abc-defg-hij',
    'http://intranet.acme.com/meet',
    'HTTPS://Zoom.US/j/1',
    'https://zoom.us:8443/j/1',
  ];
  for (const link of good) {
    it(`keeps ${link} exactly as typed`, () => {
      expect(normalizeMeetingLink(link)).toBe(link);
    });
  }

  it('trims spaces around the link', () => {
    expect(normalizeMeetingLink('  https://zoom.us/j/1  ')).toBe('https://zoom.us/j/1');
  });

  it('adds https:// to a pasted bare address', () => {
    expect(normalizeMeetingLink('zoom.us/j/123')).toBe('https://zoom.us/j/123');
    expect(normalizeMeetingLink('meet.google.com/abc-defg-hij')).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('treats host:port as an address, not a scheme', () => {
    expect(normalizeMeetingLink('zoom.us:8443/j/1')).toBe('https://zoom.us:8443/j/1');
  });
});

describe('normalizeMeetingLink: rejects anything that is not a web link', () => {
  const bad = [
    'not a url', // the audit case
    'meet',
    'localhost',
    'https://',
    'https://localhost/x',
    'javascript:alert(1)',
    'JavaScript:alert(document.cookie)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'mailto:ceo@acme.com',
    'tel:+966500000000',
    'zoom:abc',
    'ftp://files.acme.com/x',
    'file:///etc/passwd',
    'https://zoom .us/j/1',
    'https://.zoom.us/j/1',
    'https://zoom..us/j/1',
    'https://user:pass@zoom.us/j/1',
    '',
    '   ',
    `https://zoom.us/${'a'.repeat(2100)}`,
  ];
  for (const link of bad) {
    it(`rejects ${JSON.stringify(link.slice(0, 40))}`, () => {
      expect(normalizeMeetingLink(link)).toBeNull();
      expect(isValidMeetingLink(link)).toBe(false);
    });
  }
});

describe('getMeetingLinkError', () => {
  it('asks for a URL or a location when empty, depending on the platform', () => {
    expect(getMeetingLinkError('zoom', '  ')).toBe('A meeting URL is required.');
    expect(getMeetingLinkError('in_person', '')).toBe('A location is required.');
  });

  it('explains how to fix a bad link', () => {
    expect(getMeetingLinkError('teams', 'not a url')).toBe(MEETING_LINK_ERROR);
  });

  it('lets in-person meetings use any text, including Arabic', () => {
    expect(getMeetingLinkError('in_person', 'Boardroom 3, Level 12')).toBeNull();
    expect(getMeetingLinkError('in_person', 'قاعة الاجتماعات الرئيسية')).toBeNull();
  });

  it('passes a good link', () => {
    expect(getMeetingLinkError('google_meet', 'https://meet.google.com/abc-defg-hij')).toBeNull();
  });
});

describe('getMeetingLinkToSave', () => {
  it('saves the cleaned link for online meetings', () => {
    expect(getMeetingLinkToSave('zoom', ' zoom.us/j/1 ')).toBe('https://zoom.us/j/1');
  });

  it('saves trimmed text for in-person meetings, untouched otherwise', () => {
    expect(getMeetingLinkToSave('in_person', '  zoom.us room  ')).toBe('zoom.us room');
  });
});
