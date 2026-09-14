// A narrative section is stored as {"heading": …, "content": …} — the report
// prints that heading above the paragraph. Every screen that DISPLAYS one already
// unwrapped it; the two inline EDITORS never did, so clicking Edit put raw JSON in
// the textarea. Saving from there wrote the mangled string straight back, and once
// the JSON stopped parsing the exporter fell through to its prose branch and
// printed the literal JSON into the delivered PDF.
//
// What is worth pinning here is the round-trip, because every way it can break is
// silent: the heading disappears from the export, or JSON reaches the reader.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { readNarrativeEnvelope, writeNarrativeEnvelope } from '@/lib/sectionEnvelope';
import { EditableSectionContent } from '@/components/quarterly/EditableSectionContent';
import type { ProducedSection } from '@/types/quarterly';

const HEADING = "CEO's Message to Shareholders";
const BODY = 'Amin H. Nasser highlighted the third-quarter performance.';
const ENVELOPE = JSON.stringify({ heading: HEADING, content: BODY });

describe('readNarrativeEnvelope', () => {
  it('reads the heading and the prose', () => {
    expect(readNarrativeEnvelope(ENVELOPE)).toEqual({ heading: HEADING, body: BODY });
  });

  it('refuses a table that happens to carry a content key', () => {
    // produce_hybrid writes {title, rows, analysis}. Without the rows/tables
    // guard a real table would open in the PROSE editor and be flattened to a
    // paragraph on save. The backend exporters exclude it the same way.
    expect(readNarrativeEnvelope(JSON.stringify({ title: 'T', rows: [{ a: 1 }], content: 'x' }))).toBeNull();
    expect(readNarrativeEnvelope(JSON.stringify({ tables: [{ rows: [] }], content: 'x' }))).toBeNull();
  });

  it('returns null for plain prose and for JSON someone already broke', () => {
    // Null means "treat the whole string as the text" — which is what keeps a
    // section that was saved mangled editable instead of stranded.
    expect(readNarrativeEnvelope('Just a paragraph.')).toBeNull();
    expect(readNarrativeEnvelope('{"heading": "x", "content": "broken')).toBeNull();
    expect(readNarrativeEnvelope(JSON.stringify({ heading: 'x', content: '   ' }))).toBeNull();
  });

  it('accepts an already-parsed object', () => {
    // /assemble hands sections back as objects, not strings.
    expect(readNarrativeEnvelope({ heading: 'H', content: 'B' })?.body).toBe('B');
  });
});

describe('writeNarrativeEnvelope', () => {
  it('round-trips and preserves keys it does not know about', () => {
    const original = JSON.stringify({ heading: HEADING, content: BODY, extra: 42 });
    expect(JSON.parse(writeNarrativeEnvelope(original, 'New heading', 'New body'))).toEqual({
      heading: 'New heading',
      content: 'New body',
      extra: 42,
    });
  });

  it('leaves a plain-prose section a plain string', () => {
    // Wrapping it would invent a shape the producer never wrote.
    expect(writeNarrativeEnvelope('plain prose', null, 'edited')).toBe('edited');
  });

  it('an emptied heading is stored as null, not an empty string', () => {
    expect(JSON.parse(writeNarrativeEnvelope(ENVELOPE, '   ', BODY)).heading).toBeNull();
  });
});

const section = (content: string, over: Partial<ProducedSection> = {}): ProducedSection => ({
  section_code: 'ceo_statement',
  title: 'CEO Statement',
  display_order: 2,
  source_type: 'AI-written',
  mode: 'generate',
  status: 'produced',
  content,
  feeder_status: 'ready',
  ...over,
});

const editor = (s: ProducedSection, onSave = vi.fn()) => {
  render(
    <EditableSectionContent
      section={s}
      editing
      saving={false}
      error={null}
      onSave={onSave}
      onCancel={() => {}}
    />,
  );
  return onSave;
};

describe('EditableSectionContent — narrative envelope', () => {
  it('shows the prose, not the JSON, and the heading in its own field', () => {
    editor(section(ENVELOPE));
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe(BODY);
    expect(textarea.value).not.toContain('"heading"');
    expect((screen.getByPlaceholderText('Section heading') as HTMLInputElement).value).toBe(HEADING);
  });

  it('saving an edited paragraph keeps the heading', () => {
    // The bug that mattered: the heading vanished from the export the first time
    // anyone touched the text.
    const onSave = editor(section(ENVELOPE));
    fireEvent.change(screen.getByDisplayValue(BODY), { target: { value: 'Rewritten paragraph.' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(JSON.parse(onSave.mock.calls[0][0])).toEqual({
      heading: HEADING,
      content: 'Rewritten paragraph.',
    });
  });

  it('a heading-only edit is a real change and can be saved', () => {
    const onSave = editor(section(ENVELOPE));
    fireEvent.change(screen.getByPlaceholderText('Section heading'), {
      target: { value: 'A Word From Our CEO' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(JSON.parse(onSave.mock.calls[0][0])).toEqual({
      heading: 'A Word From Our CEO',
      content: BODY,
    });
  });

  it('plain prose edits as plain prose, with no heading field', () => {
    const onSave = editor(section('A plain paragraph.'));
    expect(screen.queryByPlaceholderText('Section heading')).not.toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('A plain paragraph.'), { target: { value: 'Edited.' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith('Edited.');
  });

  it('a section already saved as broken JSON opens as editable text', () => {
    // The auto-heal path — no migration, the user can just fix it in place.
    const broken = '{"heading": "x", "content": "half a sen';
    editor(section(broken));
    expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toBe(broken);
  });

  it('a hybrid table still opens the table editor, not the prose editor', () => {
    editor(section(JSON.stringify({ title: 'Revenue', rows: [{ label: 'Q3', value: '1' }] })));
    expect(screen.queryByPlaceholderText('Section heading')).not.toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').length).toBeGreaterThan(0);
  });
});
