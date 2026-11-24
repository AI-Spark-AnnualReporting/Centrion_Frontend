// Users can't edit their own profile (by design), but the page still showed a
// greyed-out Edit button whose tooltip was a developer note: "Profile edit will
// be wired up when the backend exposes the endpoint." (QA audit PU-02). Both are
// gone; the details still show.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/api', () => ({
  auth: {
    me: () =>
      Promise.resolve({
        user_id: 'u1',
        full_name: 'Danial Admin',
        email: 'danial@testing.com',
        role: 'admin',
      }),
  },
}));

import ProfilePage from '@/pages/ProfilePage';

describe('User Profile page', () => {
  it('shows the details without an Edit button or developer note', async () => {
    const { container } = render(<ProfilePage />);
    expect((await screen.findAllByText('Danial Admin')).length).toBeGreaterThan(0);
    expect(screen.getByText('Personal Information')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
    expect(container.innerHTML).not.toMatch(/wired up|backend exposes/i);
  });
});
