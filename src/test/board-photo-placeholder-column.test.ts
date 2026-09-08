// BR32's Photo column on the REVIEW SCREEN only.
//
// The server drops a column nobody filled, which is right for the download — a
// signed-off report should not print a column of grey silhouettes — and wrong
// for the review screen, where a missing photograph is the thing the author
// still has to act on and an absent column says nothing at all.
//
// withPhotoPlaceholders puts the silhouette back, client-side, so the export is
// untouched.

import { describe, expect, it } from 'vitest';
import { withPhotoPlaceholders } from '@/pages/annual-report/board-helpers';
import type { ProducedSection } from '@/types/quarterly';

const PNG = 'data:image/png;base64,AAAA';

const section = (payload: unknown, code = 'BR32'): ProducedSection => ({
  section_code: code,
  title: 'Board of Directors & profiles (CVs)',
  display_order: 1,
  source_type: 'test',
  mode: 'table',
  status: 'done',
  content: JSON.stringify(payload),
  feeder_status: 'ready',
});

const parse = (s: ProducedSection) =>
  JSON.parse(s.content as string) as { columns: string[]; rows: Record<string, unknown>[] };

/** One director's opening row, then a continuation row for their second job. */
const uploaded = (over: Record<string, unknown> = {}) => ({
  columns: ['Name', 'Job title', 'Company'],
  rows: [
    { Name: 'Yousif H. Mansoor', 'Job title': 'Managing Partner', jobs: [{}, {}], source: 'upload', ...over },
    { Name: '', 'Job title': 'Audit Partner' },
  ],
});

describe('withPhotoPlaceholders', () => {
  it('adds a Photo column and a silhouette for a director who has none', () => {
    const out = parse(withPhotoPlaceholders(section(uploaded())));

    expect(out.columns[0]).toBe('Photo');
    expect(String(out.rows[0].Photo)).toMatch(/^data:image\/svg\+xml/);
  });

  it('leaves a real photograph alone', () => {
    const out = parse(withPhotoPlaceholders(section(uploaded({ Photo: PNG }))));
    expect(out.rows[0].Photo).toBe(PNG);
  });

  it('does not put a silhouette on a continuation row', () => {
    // Row two is the same person's second job — it shares the photo cell above
    // it, so a second avatar would read as a second director.
    const out = parse(withPhotoPlaceholders(section(uploaded())));
    expect(out.rows[1].Photo).toBeUndefined();
  });

  it('leaves ticked team members alone', () => {
    // Their photograph comes from the team page, which this editor cannot fix,
    // so prompting for one here would point at nothing.
    const team = {
      columns: ['Name'],
      rows: [{ Name: 'Dr. Sultan Al-Harbi', jobs: [{}], source: 'team' }],
    };
    const out = parse(withPhotoPlaceholders(section(team)));

    expect(out.columns).toEqual(['Name']);
    expect(out.rows[0].Photo).toBeUndefined();
  });

  it('leaves every other section alone', () => {
    const other = section(uploaded(), 'BR35');
    expect(withPhotoPlaceholders(other)).toBe(other);
  });

  it('never breaks a section it cannot read', () => {
    const broken = { ...section({}), content: 'not json' };
    expect(withPhotoPlaceholders(broken)).toBe(broken);

    const noRows = section({ columns: ['Name'] });
    expect(withPhotoPlaceholders(noRows)).toBe(noRows);
  });
});
