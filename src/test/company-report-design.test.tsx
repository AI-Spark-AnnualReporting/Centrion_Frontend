// The company-level report design default.
//
// Two halves, and the second is the one that carries the feature: saving on the
// Brand Identity page is worth nothing unless the report design modal actually
// opens on those values. What's pinned here is the precedence — a report that
// made its own pick keeps it; only a report that never picked follows the company.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CoverTemplatePicker } from '@/components/quarterly/CoverTemplatePicker';
import type { CompanyDesignDefault, CoverTemplate, Typography } from '@/types/quarterly';
import type { ColorPalette } from '@/types/brand';


const TEMPLATES: CoverTemplate[] = [
  { key: 'classic', name: 'Classic', description: 'Centered serif title', is_default: true },
  { key: 'bold', name: 'Bold', description: 'Large title on a band' },
  { key: 'minimal', name: 'Minimal', description: 'Left-aligned sans-serif' },
];

const PALETTES: ColorPalette[] = [
  { key: 'violet_cyan', name: 'Violet & Cyan', primary: '#3C0866', secondary: '#5BC9E2' },
  { key: 'navy_gold', name: 'Navy & Gold', primary: '#0A1F44', secondary: '#C9A227' },
];

const COMPANY_TYPO: Typography = {
  heading: { family: 'Merriweather', size: 18, weight: 700 },
  subheading: { family: 'Inter', size: 12, weight: 700 },
  body: { family: 'Inter', size: 11, weight: 400 },
};

const COMPANY_DEFAULT: CompanyDesignDefault = {
  cover_template_key: 'bold',
  brand: { primary: '#0A1F44', secondary: '#C9A227', palette_key: 'navy_gold' },
  typography: COMPANY_TYPO,
};

function open(over: Partial<Parameters<typeof CoverTemplatePicker>[0]> = {}) {
  const onApply = vi.fn();
  render(
    <CoverTemplatePicker
      templates={TEMPLATES}
      palettes={PALETTES}
      initialTemplateKey={null}
      initialBrand={null}
      onApply={onApply}
      onClose={vi.fn()}
      {...over}
    />,
  );
  return { onApply };
}

beforeEach(() => vi.clearAllMocks());


describe('a report that has never been styled', () => {
  it('opens on the company default rather than the catalogue default', async () => {
    const { onApply } = open({ companyDefault: COMPANY_DEFAULT });
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));
    await waitFor(() => expect(onApply).toHaveBeenCalled());
    // 'bold', not the is_default 'classic'.
    expect(onApply.mock.calls[0][0].cover_template_key).toBe('bold');
  });

  it('opens on the company colours', async () => {
    const { onApply } = open({ companyDefault: COMPANY_DEFAULT });
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));
    await waitFor(() => expect(onApply).toHaveBeenCalled());
    expect(onApply.mock.calls[0][0].brand).toMatchObject({ palette_key: 'navy_gold' });
  });

  it('opens on the company typography', async () => {
    const { onApply } = open({ companyDefault: COMPANY_DEFAULT });
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));
    await waitFor(() => expect(onApply).toHaveBeenCalled());
    expect(onApply.mock.calls[0][0].typography.heading.family).toBe('Merriweather');
  });

  it('marks the company default as the selected layout card', () => {
    open({ companyDefault: COMPANY_DEFAULT });
    // The layout cards are the buttons carrying a template DESCRIPTION — the
    // palette pills and the Regular/Bold weight toggles also use aria-pressed,
    // and "Bold" is a weight label as well as a template name.
    const cards = screen
      .getAllByRole('button')
      .filter((b) => TEMPLATES.some((t) => t.description && b.textContent?.includes(t.description)));
    expect(cards).toHaveLength(TEMPLATES.length);
    const selected = cards.filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toContain('Large title on a band');
  });
});


describe("a report that made its own pick", () => {
  it('keeps its own layout over the company default', async () => {
    const { onApply } = open({
      companyDefault: COMPANY_DEFAULT,
      initialTemplateKey: 'minimal',
    });
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));
    await waitFor(() => expect(onApply).toHaveBeenCalled());
    expect(onApply.mock.calls[0][0].cover_template_key).toBe('minimal');
  });

  it('keeps its own colours over the company default', async () => {
    const own = { primary: '#0B5D3B', secondary: '#64748B', palette_key: 'green_slate' };
    const { onApply } = open({ companyDefault: COMPANY_DEFAULT, initialBrand: own });
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));
    await waitFor(() => expect(onApply).toHaveBeenCalled());
    expect(onApply.mock.calls[0][0].brand.palette_key).toBe('green_slate');
  });

  it('keeps its own typography over the company default', async () => {
    const own: Typography = {
      heading: { family: 'Lato', size: 16, weight: 400 },
      subheading: { family: 'Lato', size: 11, weight: 700 },
      body: { family: 'Lato', size: 11, weight: 400 },
    };
    const { onApply } = open({ companyDefault: COMPANY_DEFAULT, initialTypography: own });
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));
    await waitFor(() => expect(onApply).toHaveBeenCalled());
    expect(onApply.mock.calls[0][0].typography.heading.family).toBe('Lato');
  });
});


describe('with no company default set', () => {
  it('behaves exactly as it did before — the catalogue default wins', async () => {
    const { onApply } = open();
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));
    await waitFor(() => expect(onApply).toHaveBeenCalled());
    expect(onApply.mock.calls[0][0].cover_template_key).toBe('classic');
  });

  it('is unaffected by an explicitly null default', async () => {
    const { onApply } = open({ companyDefault: null });
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));
    await waitFor(() => expect(onApply).toHaveBeenCalled());
    expect(onApply.mock.calls[0][0].cover_template_key).toBe('classic');
  });
});


describe('the typography section', () => {
  it('does not call the company default "Customised"', () => {
    // The pill compares against what "recommended" means. With a company default
    // in play that IS the company's type — a user sitting on it has customised
    // nothing, and Reset must not offer to throw it away.
    open({ companyDefault: COMPANY_DEFAULT });
    expect(screen.queryByText(/customised/i)).toBeNull();
  });
});
