import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BackToOrigin } from './BackToOrigin';

/* The `?back=` half is the one worth pinning: it takes a URL from whoever wrote
   the link, and this bar renders it as a trusted-looking button. */

function at(path: string, state?: unknown) {
  // A string entry gets parsed into pathname + search; an object one would
  // leave "?back=…" sitting inside the pathname, unread.
  const [pathname, search] = path.split('?');
  render(
    <MemoryRouter initialEntries={[{ pathname, search: search ? `?${search}` : '', state }]}>
      <BackToOrigin />
    </MemoryRouter>,
  );
}

describe('BackToOrigin', () => {
  it('follows an in-app path from router state', () => {
    at('/earnings/rep_1/preview', { backTo: '/communications/threads/thr_1' });
    expect(screen.getByRole('link')).toHaveAttribute('href', '/communications/threads/thr_1');
  });

  it('follows an in-app path from ?back=', () => {
    at('/earnings/rep_1/preview?back=%2Fcomms');
    expect(screen.getByRole('link')).toHaveAttribute('href', '/comms');
  });

  it('follows a URL back to the SAR app', () => {
    const back = encodeURIComponent('http://localhost:3000/pm/communication?thread=thr_1');
    at(`/earnings/rep_1/preview?back=${back}`);
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      'http://localhost:3000/pm/communication?thread=thr_1',
    );
  });

  it('refuses anywhere else', () => {
    // Otherwise the bar is a phishing link wearing our chrome: it reads "Back
    // to the conversation" and goes wherever the link author chose.
    at(`/earnings/rep_1/preview?back=${encodeURIComponent('https://evil.example/login')}`);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows nothing when the reader arrived on their own', () => {
    at('/earnings/rep_1/preview');
    expect(screen.queryByRole('link')).toBeNull();
  });
});
