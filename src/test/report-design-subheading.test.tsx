// The four subheading options in the Report Design modal — numbering, case,
// spacing and colour — which style the headings the engine writes INSIDE a
// section's body (h3/h4), not the section title.
//
// What's really pinned here is the comparison. `rolesEqual` decides three
// things at once — the "Customised" pill, the "Reset to recommended" link and
// the layout-swap banner — and all four of these keys are optional, so a role
// object saved before they existed has none of them while the layout
// blueprints now spell all four out. Read a missing key as `undefined` and an
// untouched design starts calling itself customised, offering to reset itself
// to what it already is. Nothing crashes; it just goes quietly wrong, which is
// why it gets a test rather than a comment.
//
// The switch/radio assertion guards the other convention: this design UI has
// no toggles. Every boolean and small enum is a segmented button group, and
// the shadcn switch/toggle/radio-group scaffold has zero imports in src.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TypographyControls, hasCustomTypography } from '@/components/quarterly/TypographyControls';
import { ReportPreview } from '@/components/quarterly/ReportPreview';
import { LAYOUT_TYPOGRAPHY_DEFAULTS } from '@/types/quarterly';
import type { BrandColors, Typography } from '@/types/quarterly';

// A typography object as it was stored before the subheading options existed:
// family, size and weight, and nothing else. Same values as Bold's blueprint,
// which now carries all four keys explicitly.
const LEGACY: Typography = {
  heading: { family: 'Inter', size: 18, weight: 700 },
  subheading: { family: 'Inter', size: 12, weight: 700 },
  body: { family: 'Inter', size: 11, weight: 400 },
};

const BOLD = LAYOUT_TYPOGRAPHY_DEFAULTS.bold;

const BRAND: BrandColors = { primary: '#0A1F44', secondary: '#C9A227', palette_key: 'navy_gold' };


describe('a role object saved before the subheading options existed', () => {
  it('is not "Customised" against a blueprint that spells all four out', () => {
    // The whole point: no keys and every key at its default are the same design.
    expect(hasCustomTypography(LEGACY, BOLD)).toBe(false);
  });

  it('compares the same way round the other way', () => {
    // The blueprint is the stored value and the legacy object the recommendation
    // whenever the server catalogue is a step behind the frontend constant.
    expect(hasCustomTypography(BOLD, LEGACY)).toBe(false);
  });

  it('is "Customised" as soon as one option is actually moved', () => {
    const upper: Typography = { ...LEGACY, subheading: { ...LEGACY.subheading, case: 'upper' } };
    expect(hasCustomTypography(upper, BOLD)).toBe(true);
  });

  it('notices a change in each of the four keys, not just the first', () => {
    const changed: Partial<Typography['subheading']>[] = [
      { numbering: 'plain' },
      { case: 'upper' },
      { spacing: 'loose' },
      { color: 'brand' },
    ];
    for (const patch of changed) {
      const next: Typography = { ...LEGACY, subheading: { ...LEGACY.subheading, ...patch } };
      expect(hasCustomTypography(next, BOLD)).toBe(true);
    }
  });
});


describe('the subheading sub-row', () => {
  function open(value: Typography = LEGACY) {
    const onChange = vi.fn();
    render(
      <TypographyControls
        value={value}
        onChange={onChange}
        layoutName="Bold"
        layoutDefaults={BOLD}
      />,
    );
    return { onChange };
  }

  it('renders one segmented group per option', () => {
    open();
    for (const name of [
      'Subheading numbering',
      'Subheading case',
      'Subheading spacing',
      'Subheading colour',
    ]) {
      expect(screen.getByRole('group', { name })).toBeInTheDocument();
    }
  });

  it('uses segmented buttons, never a switch or a radio group', () => {
    open();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('shows a legacy role sitting on the defaults, not on nothing', () => {
    open();
    const pressed = (group: string) =>
      screen.getByRole('group', { name: group }).querySelector('[aria-pressed="true"]')?.textContent;
    expect(pressed('Subheading numbering')).toBe('Numbered');
    expect(pressed('Subheading case')).toBe('Normal');
    expect(pressed('Subheading spacing')).toBe('Normal');
    expect(pressed('Subheading colour')).toBe('Body ink');
  });

  it('emits a complete subheading role, because the PATCH replaces typography wholesale', () => {
    // The backend does not merge keys: whatever the modal sends IS the stored
    // object. A key left off here comes back as the backend's default next save.
    const { onChange } = open();
    fireEvent.click(screen.getByRole('button', { name: 'UPPERCASE' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].subheading).toEqual({
      family: 'Inter',
      size: 12,
      weight: 700,
      numbering: 'numbered',
      case: 'upper',
      spacing: 'normal',
      color: 'body',
    });
  });

  it('leaves the heading and body rows alone', () => {
    const { onChange } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Plain' }));
    const next: Typography = onChange.mock.calls[0][0];
    expect(next.heading).toEqual(LEGACY.heading);
    expect(next.body).toEqual(LEGACY.body);
  });
});


describe('the preview h3', () => {
  function h3(typography: Typography): HTMLHeadingElement {
    const { container } = render(
      <ReportPreview
        variant="classic"
        brand={BRAND}
        typography={typography}
        logoUrl={null}
        paneWidth={400}
        view="page"
      />,
    );
    return container.querySelector('h3')!;
  }

  it('renders a legacy role exactly as it always did', () => {
    const el = h3(LEGACY);
    expect(el.textContent).toBe('1.1 Highlights');
    expect(el.style.margin).toBe('14px 0px 6px 0px');
    expect(el.style.color).toBe('rgb(26, 26, 26)');
    expect(el.style.textTransform).toBe('none');
  });

  it('moves on all four options', () => {
    const el = h3({
      ...LEGACY,
      subheading: {
        ...LEGACY.subheading,
        numbering: 'plain',
        case: 'upper',
        spacing: 'loose',
        color: 'brand',
      },
    });
    expect(el.textContent).toBe('Highlights');          // numbering: no "N.M " prefix
    expect(el.style.margin).toBe('22px 0px 10px 0px');  // spacing: loose
    expect(el.style.color).toBe('rgb(10, 31, 68)');     // colour: the brand primary
    expect(el.style.textTransform).toBe('uppercase');   // case
  });

  it('reads tight spacing off the shared px map', () => {
    const el = h3({ ...LEGACY, subheading: { ...LEGACY.subheading, spacing: 'tight' } });
    expect(el.style.margin).toBe('8px 0px 4px 0px');
  });
});
