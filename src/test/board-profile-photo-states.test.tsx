// BR32's profile editor has two photo states, and the EMPTY one is the point.
//
// A CV almost never carries a usable portrait — board_cv_extractor stores
// photo_path as null every time — so "this director has no picture" is what an
// upload normally produces. The row therefore has to say so and offer the fix in
// the same breath. Hiding the first upload behind an edit affordance would leave
// a director with no face and nothing on screen saying it was ever an option.
//
// Runs against the REAL @/lib/api with only fetch stubbed, same reasoning as
// quarterly-metrics-popup: a mocked api module is free to invent an export
// production does not have.

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import BoardProfileTable from '@/pages/annual-report/BoardProfileTable';
import type { BoardProfile } from '@/types/board';

const PNG =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmM' +
  'IQAAAABJRU5ErkJggg==';

const withPhoto: BoardProfile = {
  id: 'bdp_1',
  full_name: 'Yousif H. Mansoor',
  title: 'Chairman, Audit Committee',
  has_photo: true,
  photo_data_uri: PNG,
  experience: [],
};

const withoutPhoto: BoardProfile = {
  id: 'bdp_2',
  full_name: 'Fatima R. Al Zayani',
  title: 'Non-Executive Director',
  has_photo: false,
  photo_data_uri: null,
  experience: [],
};

const realFetch = global.fetch;

function stubProfiles(profiles: BoardProfile[]) {
  global.fetch = vi.fn(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          report_id: 'rpt_1',
          section_code: 'BR32',
          profiles,
          count: profiles.length,
          documents: [{ id: 'doc_1', filename: 'board_cvs.docx' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ),
  ) as unknown as typeof fetch;
}

const renderEditor = () =>
  render(
    <BoardProfileTable
      reportId="rpt_1"
      sectionCode="BR32"
      disabled={false}
      onSaved={() => {}}
      onCancel={() => {}}
    />,
  );

/** The person block holding this name — each row owns its own photo control. */
const rowFor = (name: string) =>
  (screen.getByDisplayValue(name).closest('.bpt-person') as HTMLElement);

beforeEach(() => {
  localStorage.setItem('token', 't');
});

afterEach(() => {
  global.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('BR32 profile photo states', () => {
  it('offers a named Upload picture action on a director who has none', async () => {
    stubProfiles([withoutPhoto]);
    renderEditor();

    const row = await waitFor(() => rowFor('Fatima R. Al Zayani'));

    // THE assertion: the first upload is on the row, not behind an edit icon.
    expect(within(row).getByText('Upload picture')).toBeInTheDocument();
    expect(within(row).queryByText(/Edit/)).toBeNull();
    // And the placeholder says whose it is, so two empty rows are distinct.
    expect(
      within(row).getByLabelText('Upload a photo of Fatima R. Al Zayani'),
    ).toBeInTheDocument();
  });

  it('shows the picture and an Edit action on a director who has one', async () => {
    stubProfiles([withPhoto]);
    renderEditor();

    const row = await waitFor(() => rowFor('Yousif H. Mansoor'));

    expect(within(row).getByAltText('Yousif H. Mansoor')).toHaveAttribute('src', PNG);
    expect(within(row).getByText(/Edit/)).toBeInTheDocument();
    expect(within(row).queryByText('Upload picture')).toBeNull();
    expect(
      within(row).getByLabelText('Change the photo of Yousif H. Mansoor'),
    ).toBeInTheDocument();
  });

  it("keeps each director's own state on their own row", async () => {
    stubProfiles([withPhoto, withoutPhoto]);
    renderEditor();

    await waitFor(() => rowFor('Yousif H. Mansoor'));

    expect(within(rowFor('Yousif H. Mansoor')).getByText(/Edit/)).toBeInTheDocument();
    expect(
      within(rowFor('Fatima R. Al Zayani')).getByText('Upload picture'),
    ).toBeInTheDocument();
  });

  it('swaps the placeholder for the picture as soon as one is chosen', async () => {
    stubProfiles([withoutPhoto]);
    renderEditor();

    const row = await waitFor(() => rowFor('Fatima R. Al Zayani'));
    const input = row.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([Uint8Array.from([137, 80, 78, 71])], 'face.png', {
      type: 'image/png',
    });
    fireEvent.change(input, { target: { files: [file] } });

    // No save round trip: the row draws the new face immediately, then the
    // upload rides along with the next PUT as photo_base64.
    await waitFor(() =>
      expect(within(rowFor('Fatima R. Al Zayani')).getByText(/Edit/)).toBeInTheDocument(),
    );
    expect(within(rowFor('Fatima R. Al Zayani')).queryByText('Upload picture')).toBeNull();
  });

  it('returns to the placeholder when the picture is cleared', async () => {
    stubProfiles([withPhoto]);
    renderEditor();

    const row = await waitFor(() => rowFor('Yousif H. Mansoor'));
    fireEvent.click(within(row).getByLabelText('Remove the photo of Yousif H. Mansoor'));

    await waitFor(() =>
      expect(
        within(rowFor('Yousif H. Mansoor')).getByText('Upload picture'),
      ).toBeInTheDocument(),
    );
  });
});

// The actions live above the members, and only the members scroll. A board runs
// to a dozen people with several jobs each, so Save used to sit under all of
// them — and "+ Add a person" was furthest from the list it appends to.
describe('BR32 profile editor layout', () => {
  const SAVE = 'Save and rebuild the section';

  it('puts Save, Cancel and Add a person above the first member', async () => {
    stubProfiles([withPhoto, withoutPhoto]);
    renderEditor();

    const firstRow = await waitFor(() => rowFor('Yousif H. Mansoor'));

    for (const label of [SAVE, 'Cancel', '+ Add a person']) {
      const button = screen.getByText(label);
      const isAbove = button.compareDocumentPosition(firstRow) & Node.DOCUMENT_POSITION_FOLLOWING;
      expect(isAbove, `${label} should come before the members`).toBeTruthy();
    }
  });

  it('scrolls the members and nothing else', async () => {
    stubProfiles([withPhoto, withoutPhoto]);
    renderEditor();

    const row = await waitFor(() => rowFor('Yousif H. Mansoor'));
    const list = row.parentElement as HTMLElement;

    expect(list.style.overflowY).toBe('auto');
    expect(list.style.maxHeight).toBe('55vh');
    // The save button must NOT be inside the box that scrolls.
    expect(list.contains(screen.getByText(SAVE))).toBe(false);
  });

  it('adds a person to the scrolling list, not beside the buttons', async () => {
    stubProfiles([withPhoto]);
    renderEditor();

    const row = await waitFor(() => rowFor('Yousif H. Mansoor'));
    const list = row.parentElement as HTMLElement;
    expect(list.querySelectorAll('.bpt-person')).toHaveLength(1);

    fireEvent.click(screen.getByText('+ Add a person'));

    await waitFor(() => expect(list.querySelectorAll('.bpt-person')).toHaveLength(2));
  });
});
