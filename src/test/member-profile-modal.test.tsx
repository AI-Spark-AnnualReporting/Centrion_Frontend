// The one thing worth pinning in the profile popup is the add-experience
// round trip: the button gates on three required fields, the new row has to
// reach the table, and the draft has to reset so the next entry starts clean.
// Everything else in the modal is presentational.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MemberProfileModal, {
  type MemberProfile,
} from '@/components/MemberProfileModal';

const EMPTY_PROFILE: MemberProfile = { experiences: [] };

const person = {
  id: 'p1',
  firstName: 'Board1',
  lastName: 'Memeber1',
  role: 'Chair',
  email: 'boardmember1@aramco.com',
  bio: '',
  status: 'pending' as const,
};

function renderModal(profile: MemberProfile = EMPTY_PROFILE) {
  const onChange = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <MemberProfileModal
      person={person}
      companyName="Aramco"
      positionLabel="Board Member"
      positionBadgeClass="b-bl"
      profile={profile}
      onChange={onChange}
      onClose={onClose}
    />,
  );
  const overlay = view.container.querySelector('.modal-overlay') as HTMLElement;
  const panel = view.container.querySelector('.modal-content') as HTMLElement;
  return { onChange, onClose, view, overlay, panel };
}

const addButton = () => screen.getByRole('button', { name: /add experience/i });

// This popup carries an unsaved experience draft, so unlike the app's other
// .modal-overlay screens the backdrop is inert on purpose: only Escape, the
// close X and Done get you out.
describe('MemberProfileModal — dismissal', () => {
  it('closes on Escape', () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stops listening for Escape once unmounted', () => {
    const { onClose, view } = renderModal();
    view.unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes from the X and from Done', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  // The whole point: a half-typed experience must survive a stray click on the
  // purple. Nothing about clicking the backdrop may dismiss this popup.
  it('ignores a click on the backdrop', () => {
    const { onClose, overlay } = renderModal();
    fireEvent.mouseDown(overlay);
    fireEvent.mouseUp(overlay);
    fireEvent.click(overlay);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps a half-typed experience when the backdrop is clicked', () => {
    const { onClose, onChange, overlay } = renderModal();
    fireEvent.change(screen.getByPlaceholderText('Chief Financial Officer'), {
      target: { value: 'CFO' },
    });
    fireEvent.click(overlay);

    expect(onClose).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Chief Financial Officer')).toHaveValue(
      'CFO',
    );
  });

  it('stays open when the click is inside the panel', () => {
    const { onClose, panel } = renderModal();
    fireEvent.click(panel);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('MemberProfileModal — experience entry', () => {
  it('keeps Add Experience disabled until job title, company and from are set', () => {
    renderModal();
    expect(addButton()).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('Chief Financial Officer'), {
      target: { value: 'CFO' },
    });
    expect(addButton()).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('Saudi Aramco'), {
      target: { value: 'Aramco' },
    });
    expect(addButton()).toBeDisabled();

    fireEvent.change(document.querySelector('input[type="month"]')!, {
      target: { value: '2019-03' },
    });
    expect(addButton()).toBeEnabled();
  });

  it('emits the new row and clears the draft on add', () => {
    const { onChange, view } = renderModal();

    fireEvent.change(screen.getByPlaceholderText('Chief Financial Officer'), {
      target: { value: 'CFO' },
    });
    fireEvent.change(screen.getByPlaceholderText('Saudi Aramco'), {
      target: { value: 'Aramco' },
    });
    const [from, to] = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="month"]'),
    );
    fireEvent.change(from, { target: { value: '2019-03' } });
    fireEvent.change(to, { target: { value: '2023-11' } });
    fireEvent.click(addButton());

    expect(onChange).toHaveBeenCalledTimes(1);
    const next: MemberProfile = onChange.mock.calls[0][0];
    expect(next.experiences).toHaveLength(1);
    expect(next.experiences[0]).toMatchObject({
      jobTitle: 'CFO',
      company: 'Aramco',
      from: '2019-03',
      to: '2023-11',
    });

    // The form must be ready for the next entry, not still holding the last one.
    expect(screen.getByPlaceholderText('Chief Financial Officer')).toHaveValue('');
    expect(addButton()).toBeDisabled();

    // Re-render controlled with the emitted profile: the row lands in the table
    // and the empty-state disappears.
    view.rerender(
      <MemberProfileModal
        person={person}
        companyName="Aramco"
        positionLabel="Board Member"
        positionBadgeClass="b-bl"
        profile={next}
        onChange={onChange}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText(/no experience added yet/i)).not.toBeInTheDocument();
    expect(screen.getByText('Mar 2019 — Nov 2023')).toBeInTheDocument();
  });

  it('records an open-ended period when Present is ticked', () => {
    const { onChange } = renderModal();

    fireEvent.change(screen.getByPlaceholderText('Chief Financial Officer'), {
      target: { value: 'Chair' },
    });
    fireEvent.change(screen.getByPlaceholderText('Saudi Aramco'), {
      target: { value: 'Aramco' },
    });
    const [from, to] = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="month"]'),
    );
    fireEvent.change(from, { target: { value: '2024-01' } });
    fireEvent.change(to, { target: { value: '2025-01' } });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(to).toBeDisabled();

    fireEvent.click(addButton());
    expect(onChange.mock.calls[0][0].experiences[0].to).toBe('');
  });

  // A long CV filename used to blow the two-column grid apart: grid items
  // default to min-width:auto, so the track grew to the row's intrinsic width
  // and pushed Replace / ✕ off the panel instead of letting .ob-logo-name
  // ellipsise. The guard is min-width:0 on both cells.
  it('constrains both upload cells so a long filename can truncate', () => {
    renderModal({
      experiences: [],
      cvName: 'Nasser_Al-Qahtani_Board_CV_2026_final_v3.docx',
      cvSize: 13 * 1024,
    });

    const name = screen.getByTitle(
      'Nasser_Al-Qahtani_Board_CV_2026_final_v3.docx',
    );
    // The ellipsis only works if every ancestor up to the grid can shrink.
    // (React emits a bare `0` for numeric zero, so parse rather than match.)
    const cell = name.closest('.ob-logo-preview')!.parentElement!;
    expect(parseFloat(cell.style.minWidth)).toBe(0);
    expect(parseFloat((name.parentElement as HTMLElement).style.minWidth)).toBe(0);

    // Both buttons stay in the row rather than being pushed out of it.
    const row = name.closest('.ob-logo-preview')!;
    expect(row).toContainElement(
      screen.getByRole('button', { name: /^replace$/i }),
    );
    expect(row).toContainElement(
      screen.getByRole('button', { name: /remove cv/i }),
    );
  });

  // A pasted job description used to sit in a narrow table column and stretch
  // the row to hundreds of pixels, burying the other three cells. It now lives
  // on its own full-width row, clamped, with the line breaks preserved.
  it('puts a long responsibility on its own clamped row with Show more', () => {
    const long = Array.from(
      { length: 8 },
      (_, i) => `${i + 1}. Responsibility line number ${i + 1}`,
    ).join('\n');

    const { onChange } = renderModal({
      experiences: [
        {
          id: 'e1',
          jobTitle: 'Senior developer',
          company: 'Spark',
          from: '2024-06',
          to: '2026-03',
          responsibility: long,
        },
      ],
    });

    // getByText normalises whitespace, so match on a line, not the whole blob.
    const prose = screen
      .getByText(/Responsibility line number 8/)
      .closest('.md-tight') as HTMLElement;

    // Full width under the facts row, not a fifth column beside them.
    const cell = prose.closest('td')!;
    expect(cell.getAttribute('colspan')).toBe('4');
    expect(cell.parentElement).not.toBe(
      screen.getByText('Senior developer').closest('tr'),
    );

    // Collapsed: clamped and faded, so the cut never leaves a half-drawn line.
    expect(prose.style.maxHeight).toBe('56px');
    expect(prose.style.overflow).toBe('hidden');

    // Expanded: scrolls inside its own row rather than stretching the panel to
    // the height of a pasted job description.
    fireEvent.click(screen.getByRole('button', { name: /show more/i }));
    expect(prose.style.maxHeight).toBe('260px');
    expect(prose.style.overflowY).toBe('auto');

    fireEvent.click(screen.getByRole('button', { name: /show less/i }));
    expect(prose.style.maxHeight).toBe('56px');

    // Expanding is presentation only - it must not rewrite the data.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('gives a short responsibility no Show more toggle', () => {
    renderModal({
      experiences: [
        {
          id: 'e1',
          jobTitle: 'CFO',
          company: 'Aramco',
          from: '2019-03',
          to: '',
          responsibility: 'Owned the annual audit.',
        },
      ],
    });
    expect(screen.getByText('Owned the annual audit.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show more/i })).toBeNull();
  });

  it('renders the responsibility as markdown', () => {
    renderModal({
      experiences: [
        {
          id: 'e1',
          jobTitle: 'Senior developer',
          company: 'Spark',
          from: '2024-06',
          to: '',
          responsibility:
            '**System Design**\n\n* Design technical solutions\n* Evaluate frameworks\n\n1. Lead development\n2. Review code',
        },
      ],
    });

    const prose = screen.getByText('System Design').closest('.md-tight')!;
    // The asterisks and hashes become real elements instead of literal text.
    expect(screen.getByText('System Design').tagName).toBe('STRONG');
    expect(prose.querySelectorAll('ul li')).toHaveLength(2);
    expect(prose.querySelectorAll('ol li')).toHaveLength(2);
    expect(prose.textContent).not.toContain('**');
  });

  // react-markdown emits only elements it builds itself unless rehype-raw is
  // added. This field takes pasted text from anywhere, so pin that it is not.
  it('escapes raw HTML in a pasted responsibility', () => {
    renderModal({
      experiences: [
        {
          id: 'e1',
          jobTitle: 'CFO',
          company: 'Aramco',
          from: '2019-03',
          to: '',
          responsibility:
            '<img src=x onerror="alert(1)"> <script>alert(2)</script> plain text',
        },
      ],
    });

    const prose = screen.getByText(/plain text/).closest('.md-tight')!;
    expect(prose.querySelector('img')).toBeNull();
    expect(prose.querySelector('script')).toBeNull();
    // It survives as visible text rather than being silently dropped.
    expect(prose.textContent).toContain('<img');
  });

  // Once entries exist the list leads and the form becomes the "add another"
  // step underneath it. Asserted through DOM position, not CSS order, because
  // tab order has to follow what is on screen.
  it('puts the list above the form once an experience exists', () => {
    renderModal({
      experiences: [
        {
          id: 'e1',
          jobTitle: 'CFO',
          company: 'Aramco',
          from: '2019-03',
          to: '',
          responsibility: '',
        },
      ],
    });

    const table = screen.getByRole('table');
    const form = screen.getByPlaceholderText('Chief Financial Officer');
    expect(
      table.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('puts the form first while there is nothing to list', () => {
    renderModal();

    const table = screen.getByRole('table');
    const form = screen.getByPlaceholderText('Chief Financial Officer');
    expect(
      table.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    expect(screen.getByText(/no experience added yet/i)).toBeInTheDocument();
  });

  it('drops a removed row', () => {
    const existing: MemberProfile = {
      experiences: [
        {
          id: 'e1',
          jobTitle: 'CFO',
          company: 'Aramco',
          from: '2019-03',
          to: '',
          responsibility: '',
        },
      ],
    };
    const { onChange } = renderModal(existing);

    expect(screen.getByText('Mar 2019 — Present')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /remove cfo at aramco/i }));
    expect(onChange).toHaveBeenCalledWith({ experiences: [] });
  });
});
