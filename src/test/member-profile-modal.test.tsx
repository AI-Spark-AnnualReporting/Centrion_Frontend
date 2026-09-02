// The popup writes through to the API now, so what is worth pinning is the
// request shape (especially to_month, where "" is a 422 and null means
// Present), the read-only mode that self-service editing introduced, and the
// layout bugs found in review.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import MemberProfileModal from '@/components/MemberProfileModal';
import { ApiError, type TeamExperience } from '@/lib/api';

// vi.mock is hoisted above every top-level const, so the factory below can
// only reach mocks created inside vi.hoisted.
const {
  listExperience,
  createExperience,
  removeExperience,
  getPhoto,
  putPhoto,
  removePhoto,
  getCv,
  uploadCv,
  removeCv,
  updateExperience,
} = vi.hoisted(() => ({
  listExperience: vi.fn(),
  createExperience: vi.fn(),
  removeExperience: vi.fn(),
  getPhoto: vi.fn(),
  putPhoto: vi.fn(),
  removePhoto: vi.fn(),
  getCv: vi.fn(),
  uploadCv: vi.fn(),
  removeCv: vi.fn(),
  updateExperience: vi.fn(),
}));

// importOriginal keeps ApiError a real class, so the component's `instanceof`
// 404 check — the one that turns "no CV yet" into an empty state instead of an
// error — is exercised rather than stubbed away.
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    team: {
      ...actual.team,
      experience: {
        list: listExperience,
        create: createExperience,
        update: updateExperience,
        remove: removeExperience,
      },
      photo: { get: getPhoto, put: putPhoto, remove: removePhoto },
      cv: { get: getCv, upload: uploadCv, remove: removeCv },
    },
  };
});

const notFound = () => new ApiError(404, 'Not Found', { detail: 'Nothing here' }, '/x');

const aCv = (over: Record<string, unknown> = {}) => ({
  id: 'cv1',
  filename: 'cv.pdf',
  size_bytes: 1024,
  content_type: 'application/pdf',
  uploaded_at: '2026-09-02T10:00:00Z',
  download_url: 'https://old',
  download_expires_at: '2026-09-02T11:00:00Z',
  ...over,
});

const person = {
  id: 'row-1',
  userId: 'usr_board1',
  firstName: 'Board1',
  lastName: 'Memeber1',
  role: 'Chair',
  email: 'boardmember1@aramco.com',
  bio: '',
  status: 'pending' as const,
};

const anExperience = (over: Partial<TeamExperience> = {}): TeamExperience => ({
  id: 'e1',
  job_title: 'CFO',
  company: 'Aramco',
  from_month: '2019-03',
  to_month: null,
  responsibility: '',
  sort_order: 0,
  ...over,
});

interface Options {
  experiences?: TeamExperience[];
  canEdit?: boolean;
  photoUri?: string | null;
}

function renderModal({ experiences = [], canEdit = true, photoUri = null }: Options = {}) {
  const onExperiencesChange = vi.fn();
  const onPhotoChange = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <MemberProfileModal
      companyId="cmp_1"
      person={person}
      companyName="Aramco"
      positionLabel="Board Member"
      positionBadgeClass="b-bl"
      canEdit={canEdit}
      experiences={experiences}
      onExperiencesChange={onExperiencesChange}
      photoUri={photoUri}
      onPhotoChange={onPhotoChange}
      onClose={onClose}
    />,
  );
  const overlay = view.container.querySelector('.modal-overlay') as HTMLElement;
  const panel = view.container.querySelector('.modal-content') as HTMLElement;
  return { onExperiencesChange, onPhotoChange, onClose, view, overlay, panel };
}

// The panel fetches photo and CV on mount, so every render settles a promise.
// Awaiting it here inside act keeps those state updates out of React's
// un-acted-update warning and off the next test.
async function open(opts?: Options) {
  const r = renderModal(opts);
  await act(async () => {});
  return r;
}

const jobTitle = () => screen.getByPlaceholderText('Chief Financial Officer');
const companyField = () => screen.getByPlaceholderText('Saudi Aramco');
const addButton = () => screen.getByRole('button', { name: /add experience/i });
const monthInputs = () =>
  Array.from(document.querySelectorAll<HTMLInputElement>('input[type="month"]'));

// Fills the three required fields, returning the month inputs so callers can
// also set an end date.
function fillRequired() {
  fireEvent.change(jobTitle(), { target: { value: 'CFO' } });
  fireEvent.change(companyField(), { target: { value: 'Aramco' } });
  const months = monthInputs();
  fireEvent.change(months[0], { target: { value: '2019-03' } });
  return months;
}

beforeEach(() => {
  vi.clearAllMocks();
  getPhoto.mockResolvedValue({
    photo_url: null,
    content_type: null,
    uploaded_at: null,
    expires_at: null,
  });
  getCv.mockRejectedValue(notFound());
  createExperience.mockImplementation((_c, _u, body) =>
    Promise.resolve({ id: 'new-1', ...body }),
  );
  removeExperience.mockResolvedValue(undefined);
  putPhoto.mockResolvedValue(undefined);
  removePhoto.mockResolvedValue(undefined);
  removeCv.mockResolvedValue(undefined);
});

describe('MemberProfileModal — loading', () => {
  it('fetches photo and CV on open, but never the experience list', async () => {
    await open();
    await waitFor(() => expect(getPhoto).toHaveBeenCalledWith('cmp_1', 'usr_board1'));
    expect(getCv).toHaveBeenCalledWith('cmp_1', 'usr_board1');
    // Experience arrives with the roster via ?include=experience,photo.
    expect(listExperience).not.toHaveBeenCalled();
  });

  // The roster's signed URL expires an hour after the page loaded, so a popup
  // opened on a long-lived tab must not reuse it.
  it('lifts a freshly signed photo URL over the one the roster supplied', async () => {
    getPhoto.mockResolvedValue({
      photo_url: 'https://fresh-signed',
      content_type: 'image/jpeg',
      uploaded_at: '2026-09-02T09:47:14Z',
      expires_at: '2026-09-02T11:00:00Z',
    });
    const { onPhotoChange } = await open({ photoUri: 'https://stale-from-roster' });
    expect(onPhotoChange).toHaveBeenCalledWith('https://fresh-signed');
  });

  // Photo and CV disagree on how "nothing uploaded" is reported, and getting
  // this backwards paints a red box on a perfectly normal member.
  it('treats a null photo_url as the placeholder, not an error', async () => {
    await open({ canEdit: false });
    expect(await screen.findByText(/no photo uploaded/i)).toBeInTheDocument();
    expect(screen.queryByText(/could not load the photo/i)).toBeNull();
  });

  it('surfaces a real photo failure', async () => {
    getPhoto.mockRejectedValue(
      new ApiError(403, 'Forbidden', { detail: 'No access to that photo.' }, '/x'),
    );
    await open({ canEdit: false });
    expect(await screen.findByText('No access to that photo.')).toBeInTheDocument();
  });

  it('treats a 404 from GET /cv as the empty state, not an error', async () => {
    await open({ canEdit: false });
    expect(await screen.findByText(/no cv uploaded/i)).toBeInTheDocument();
    expect(screen.queryByText(/nothing here/i)).toBeNull();
  });

  it('surfaces a real CV failure', async () => {
    getCv.mockRejectedValue(new ApiError(403, 'Forbidden', { detail: 'Nope.' }, '/x'));
    await open({ canEdit: false });
    expect(await screen.findByText('Nope.')).toBeInTheDocument();
  });
});

describe('MemberProfileModal — adding experience', () => {
  it('keeps Add Experience disabled until job title, company and from are set', async () => {
    await open();
    expect(addButton()).toBeDisabled();
    fireEvent.change(jobTitle(), { target: { value: 'CFO' } });
    expect(addButton()).toBeDisabled();
    fireEvent.change(companyField(), { target: { value: 'Aramco' } });
    expect(addButton()).toBeDisabled();
    fireEvent.change(monthInputs()[0], { target: { value: '2019-03' } });
    expect(addButton()).toBeEnabled();
  });

  it('posts the entry, lifts the created row and clears the draft', async () => {
    const { onExperiencesChange } = await open();
    const months = fillRequired();
    fireEvent.change(months[1], { target: { value: '2023-11' } });
    fireEvent.click(addButton());

    await waitFor(() => expect(createExperience).toHaveBeenCalledTimes(1));
    expect(createExperience).toHaveBeenCalledWith('cmp_1', 'usr_board1', {
      job_title: 'CFO',
      company: 'Aramco',
      from_month: '2019-03',
      to_month: '2023-11',
      responsibility: '',
      sort_order: 0,
    });
    // The server's row is what reaches the list, not the local draft.
    await waitFor(() =>
      expect(onExperiencesChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'new-1', job_title: 'CFO' }),
      ]),
    );
    await waitFor(() => expect(jobTitle()).toHaveValue(''));
    expect(addButton()).toBeDisabled();
  });

  // An untouched <input type="month"> reads as "", and the API answers 422 for
  // an empty string. Present and "left blank" must both become null.
  it('sends to_month as null, never an empty string', async () => {
    await open();
    fillRequired();
    fireEvent.click(addButton());
    await waitFor(() => expect(createExperience).toHaveBeenCalled());
    expect(createExperience.mock.calls[0][2].to_month).toBeNull();
  });

  it('sends null and disables the field when Present is ticked', async () => {
    await open();
    const months = fillRequired();
    fireEvent.change(months[1], { target: { value: '2025-01' } });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(months[1]).toBeDisabled();

    fireEvent.click(addButton());
    await waitFor(() => expect(createExperience).toHaveBeenCalled());
    expect(createExperience.mock.calls[0][2].to_month).toBeNull();
  });

  it('numbers sort_order from the existing count', async () => {
    await open({ experiences: [anExperience(), anExperience({ id: 'e2' })] });
    fillRequired();
    fireEvent.click(addButton());
    await waitFor(() => expect(createExperience).toHaveBeenCalled());
    expect(createExperience.mock.calls[0][2].sort_order).toBe(2);
  });

  it('shows the backend sentence and keeps the draft when the post fails', async () => {
    createExperience.mockRejectedValue(
      new ApiError(422, 'Unprocessable', { detail: 'from_month must be YYYY-MM.' }, '/x'),
    );
    const { onExperiencesChange } = await open();
    fillRequired();
    fireEvent.click(addButton());

    expect(await screen.findByText('from_month must be YYYY-MM.')).toBeInTheDocument();
    expect(onExperiencesChange).not.toHaveBeenCalled();
    expect(jobTitle()).toHaveValue('CFO');
  });

  it('deletes a row through the API before dropping it from the list', async () => {
    const { onExperiencesChange } = await open({ experiences: [anExperience()] });
    fireEvent.click(screen.getByRole('button', { name: /remove cfo at aramco/i }));
    await waitFor(() =>
      expect(removeExperience).toHaveBeenCalledWith('cmp_1', 'usr_board1', 'e1'),
    );
    expect(onExperiencesChange).toHaveBeenCalledWith([]);
  });

  it('keeps the row when the delete fails', async () => {
    removeExperience.mockRejectedValue(
      new ApiError(403, 'Forbidden', { detail: 'Requires permission: leadership:create' }, '/x'),
    );
    const { onExperiencesChange } = await open({ experiences: [anExperience()] });
    fireEvent.click(screen.getByRole('button', { name: /remove cfo at aramco/i }));
    expect(
      await screen.findByText('Requires permission: leadership:create'),
    ).toBeInTheDocument();
    expect(onExperiencesChange).not.toHaveBeenCalled();
  });
});

describe('MemberProfileModal — CV', () => {
  it('re-fetches the signed URL at click time rather than reusing a stale one', async () => {
    getCv
      .mockResolvedValueOnce(aCv())
      .mockResolvedValueOnce(aCv({ download_url: 'https://fresh' }));
    const windowOpen = vi.spyOn(window, 'open').mockReturnValue(null);

    await open();
    fireEvent.click(await screen.findByRole('button', { name: /download/i }));

    // download_url expires in an hour, so the one captured at open time is not
    // the one handed to the browser.
    await waitFor(() =>
      expect(windowOpen).toHaveBeenCalledWith('https://fresh', '_blank', 'noopener,noreferrer'),
    );
    windowOpen.mockRestore();
  });

  it('rejects an obviously wrong file before spending an upload', async () => {
    await open();
    await waitFor(() => expect(getCv).toHaveBeenCalled());
    const input = document.querySelector('input[accept=".pdf,.docx"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    });
    expect(await screen.findByText(/use a pdf or docx/i)).toBeInTheDocument();
    expect(uploadCv).not.toHaveBeenCalled();
  });
});

describe('MemberProfileModal — read-only mode', () => {
  it('hides every control when the viewer cannot edit', async () => {
    await open({ canEdit: false, experiences: [anExperience()] });
    await waitFor(() => expect(getPhoto).toHaveBeenCalled());

    expect(screen.getByText('View only')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Chief Financial Officer')).toBeNull();
    expect(screen.queryByRole('button', { name: /add experience/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /remove cfo at aramco/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /browse file/i })).toBeNull();
    // The record itself still reads.
    expect(screen.getByText('CFO')).toBeInTheDocument();
    expect(screen.getByText('Mar 2019 — Present')).toBeInTheDocument();
  });

  it('drops the action column so the header and rows still line up', async () => {
    await open({ canEdit: false, experiences: [anExperience({ responsibility: 'x' })] });
    await waitFor(() => expect(getPhoto).toHaveBeenCalled());
    expect(screen.getAllByRole('columnheader')).toHaveLength(3);
    expect(screen.getByText('x').closest('td')!.getAttribute('colspan')).toBe('3');
  });
});

describe('MemberProfileModal — responsibility rendering', () => {
  const long = Array.from(
    { length: 8 },
    (_, i) => `${i + 1}. Responsibility line number ${i + 1}`,
  ).join('\n');

  it('gives long prose its own full-width row, clamped, scrolling when opened', async () => {
    await open({ experiences: [anExperience({ responsibility: long })] });

    const prose = screen
      .getByText(/Responsibility line number 8/)
      .closest('.md-tight') as HTMLElement;

    // Full width under the facts row, not a fourth column beside them.
    const cell = prose.closest('td')!;
    expect(cell.getAttribute('colspan')).toBe('4');
    expect(cell.parentElement).not.toBe(screen.getByText('CFO').closest('tr'));

    expect(prose.style.maxHeight).toBe('56px');
    expect(prose.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByRole('button', { name: /show more/i }));
    expect(prose.style.maxHeight).toBe('260px');
    expect(prose.style.overflowY).toBe('auto');

    fireEvent.click(screen.getByRole('button', { name: /show less/i }));
    expect(prose.style.maxHeight).toBe('56px');
  });

  it('gives short prose no Show more toggle', async () => {
    await open({ experiences: [anExperience({ responsibility: 'Owned the audit.' })] });
    expect(screen.getByText('Owned the audit.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show more/i })).toBeNull();
  });

  it('renders markdown', async () => {
    await open({
      experiences: [
        anExperience({
          responsibility:
            '**System Design**\n\n* Design solutions\n* Evaluate frameworks\n\n1. Lead\n2. Review',
        }),
      ],
    });
    const prose = screen.getByText('System Design').closest('.md-tight')!;
    expect(screen.getByText('System Design').tagName).toBe('STRONG');
    expect(prose.querySelectorAll('ul li')).toHaveLength(2);
    expect(prose.querySelectorAll('ol li')).toHaveLength(2);
    expect(prose.textContent).not.toContain('**');
  });

  // react-markdown emits only elements it builds itself unless rehype-raw is
  // added. This field takes pasted text from anywhere, so pin that it is not.
  it('escapes raw HTML in a pasted responsibility', async () => {
    await open({
      experiences: [
        anExperience({
          responsibility: '<img src=x onerror="alert(1)"> <script>alert(2)</script> plain text',
        }),
      ],
    });
    const prose = screen.getByText(/plain text/).closest('.md-tight')!;
    expect(prose.querySelector('img')).toBeNull();
    expect(prose.querySelector('script')).toBeNull();
    expect(prose.textContent).toContain('<img');
  });
});

describe('MemberProfileModal — layout', () => {
  // A long CV filename used to blow the two-column grid apart: grid items
  // default to min-width:auto, so the track grew to the row's intrinsic width
  // and pushed Replace / ✕ off the panel instead of letting .ob-logo-name
  // ellipsise. The guard is min-width:0 on both cells.
  it('constrains both upload cells so a long filename can truncate', async () => {
    const filename = 'Nasser_Al-Qahtani_Board_CV_2026_final_v3.docx';
    getCv.mockResolvedValue(aCv({ filename, size_bytes: 13312 }));
    await open();

    const name = await screen.findByTitle(filename);
    const cell = name.closest('.ob-logo-preview')!.parentElement!;
    // React emits a bare `0` for numeric zero, so parse rather than match.
    expect(parseFloat(cell.style.minWidth)).toBe(0);
    expect(parseFloat((name.parentElement as HTMLElement).style.minWidth)).toBe(0);

    const row = name.closest('.ob-logo-preview')!;
    expect(row).toContainElement(screen.getByRole('button', { name: /^replace$/i }));
    expect(row).toContainElement(screen.getByRole('button', { name: /remove cv/i }));
  });

  // Once entries exist the list leads and the form becomes the "add another"
  // step underneath it. Asserted through DOM position, not CSS order, because
  // tab order has to follow what is on screen.
  it('puts the list above the form once an experience exists', async () => {
    await open({ experiences: [anExperience()] });
    const table = screen.getByRole('table');
    expect(
      table.compareDocumentPosition(jobTitle()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('puts the form first while there is nothing to list', async () => {
    await open();
    const table = screen.getByRole('table');
    expect(
      table.compareDocumentPosition(jobTitle()) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    expect(screen.getByText(/no experience added yet/i)).toBeInTheDocument();
  });
});

// This popup carries an unsaved experience draft, so unlike the app's other
// .modal-overlay screens the backdrop is inert on purpose: only Escape, the
// close X and Done get you out.
describe('MemberProfileModal — dismissal', () => {
  it('closes on Escape', async () => {
    const { onClose } = await open();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stops listening for Escape once unmounted', async () => {
    const { onClose, view } = await open();
    view.unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes from the X and from Done', async () => {
    const { onClose } = await open();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps a half-typed experience when the backdrop is clicked', async () => {
    const { onClose, overlay } = await open();
    fireEvent.change(jobTitle(), { target: { value: 'CFO' } });
    fireEvent.mouseDown(overlay);
    fireEvent.click(overlay);

    expect(onClose).not.toHaveBeenCalled();
    expect(jobTitle()).toHaveValue('CFO');
  });

  it('leaves room for the backdrop instead of filling the viewport', async () => {
    // Overrides .modal-content's 96vw, which left ~2% of viewport to click.
    expect((await open()).panel.style.maxWidth).toBe('92vw');
  });
});
