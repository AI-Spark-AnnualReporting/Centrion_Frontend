// Earnings has the same narrative envelope as quarterly ({"heading", "content"}),
// written by the same producer, but a completely separate editor component — so
// fixing quarterly did nothing for it. Same test surface, kept here so the two
// cannot drift apart again.
//
// Worse consequence on this side: earnings' exporter parses the stored string and
// falls back to its prose branch when json.loads fails, so a broken envelope puts
// literal JSON into the delivered PDF.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditableProse } from '@/components/earnings/EditableProse';
import type { EarningsProducedSection } from '@/types/earnings';

const HEADING = 'Management Commentary';
const BODY = 'The Group delivered a resilient quarter across its core segments.';
const ENVELOPE = JSON.stringify({ heading: HEADING, content: BODY });

const section = (
  content: string | null,
  over: Partial<EarningsProducedSection> = {},
): EarningsProducedSection =>
  ({
    section_code: 's05_management_commentary',
    section_number: 5,
    title: 'Management Commentary',
    display_order: 5,
    source_type: 'AI-written',
    mode: 'generate',
    status: 'produced',
    content,
    included: true,
    ...over,
  }) as EarningsProducedSection;

const editor = (s: EarningsProducedSection, onSave = vi.fn().mockResolvedValue(undefined)) => {
  render(<EditableProse section={s} locked={false} onSave={onSave} />);
  return onSave;
};

const openEditor = () => fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));

describe('EditableProse — narrative envelope', () => {
  it('opens on the prose, not the JSON, with the heading in its own field', () => {
    editor(section(ENVELOPE));
    openEditor();

    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe(BODY);
    expect(textarea.value).not.toContain('"heading"');
    expect((screen.getByPlaceholderText('Section heading') as HTMLInputElement).value).toBe(HEADING);
  });

  it('saving an edited paragraph keeps the heading', async () => {
    const onSave = editor(section(ENVELOPE));
    openEditor();
    fireEvent.change(screen.getByDisplayValue(BODY), { target: { value: 'Rewritten.' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(JSON.parse(onSave.mock.calls[0][0])).toEqual({ heading: HEADING, content: 'Rewritten.' });
  });

  it('a heading-only edit still counts as a change', async () => {
    // The unchanged-value short-circuit compares the unwrapped body; against the
    // raw JSON a heading edit would look like no change and be dropped.
    const onSave = editor(section(ENVELOPE));
    openEditor();
    fireEvent.change(screen.getByPlaceholderText('Section heading'), {
      target: { value: 'A Word From Management' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(JSON.parse(onSave.mock.calls[0][0])).toEqual({
      heading: 'A Word From Management',
      content: BODY,
    });
  });

  it('moving from the prose to the heading does not close the editor', () => {
    // The textarea saves on blur. Without the guard, clicking into the heading
    // field would commit and close before a single character could be typed.
    const onSave = editor(section(ENVELOPE));
    openEditor();
    const heading = screen.getByPlaceholderText('Section heading');
    fireEvent.blur(document.querySelector('textarea') as HTMLTextAreaElement, {
      relatedTarget: heading,
    });

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Section heading')).toBeInTheDocument();
  });

  it('a bare-string section edits as plain prose, with no heading field', async () => {
    // s08_financial_review stores an envelope only when a quarterly report is
    // linked, and a bare string otherwise — so this must be shape-sniffed, never
    // decided by section_code or mode.
    const onSave = editor(section('A plain MD&A paragraph.', { section_code: 's08_financial_review' }));
    openEditor();
    expect(screen.queryByPlaceholderText('Section heading')).not.toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('A plain MD&A paragraph.'), {
      target: { value: 'Edited.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Edited.'));
  });

  it('a section already saved as broken JSON opens as editable text', () => {
    const broken = '{"heading": "x", "content": "half a sen';
    editor(section(broken));
    openEditor();
    expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toBe(broken);
  });

  it('the table of contents offers no edit button at all', () => {
    // mode 'auto' passed every previous test here, so the ToC opened showing its
    // raw {title, entries} JSON — and it is rebuilt from the outline anyway, so a
    // hand edit is only ever lost or damaging.
    editor(
      section(JSON.stringify({ title: 'Table of Contents', entries: [{ section_number: 1, title: 'Cover' }] }), {
        section_code: 's02_toc',
        mode: 'auto',
      }),
    );
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
  });
});
