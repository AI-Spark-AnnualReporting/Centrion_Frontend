// The backend puts "@Full Name" in the message body and says who was mentioned.
// If this stops colouring them, a mention reads as ordinary text and the person
// being addressed has no way to spot it in a busy thread.

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { highlightMentions } from '@/components/communications/ThreadViewModal';

function renderBody(body: string, names: string[]) {
  const mentions = names.map((full_name, i) => ({ user_id: `usr_${i}`, full_name }));
  return render(<div>{highlightMentions(body, mentions)}</div>).container;
}

describe('highlightMentions', () => {
  it('colours the mentioned name and leaves the rest of the text alone', () => {
    const el = renderBody('@Aizaz Zulfiqar please share your account number?', ['Aizaz Zulfiqar']);

    const spans = el.querySelectorAll('span');
    expect(spans).toHaveLength(1);
    expect(spans[0].textContent).toBe('@Aizaz Zulfiqar');
    expect(el.textContent).toBe('@Aizaz Zulfiqar please share your account number?');
  });

  it('prefers the longer name when one is a prefix of the other', () => {
    const el = renderBody('@Ann Lee and @Ann ping', ['Ann', 'Ann Lee']);

    const texts = [...el.querySelectorAll('span')].map((s) => s.textContent);
    expect(texts).toEqual(['@Ann Lee', '@Ann']);
  });

  it('leaves a body with no mentions untouched', () => {
    const el = renderBody('no mentions here', []);

    expect(el.querySelectorAll('span')).toHaveLength(0);
    expect(el.textContent).toBe('no mentions here');
  });

  it('treats regex characters in a name as plain text', () => {
    const el = renderBody('@A. (Bo) Ray hi', ['A. (Bo) Ray']);

    expect(el.querySelectorAll('span')[0].textContent).toBe('@A. (Bo) Ray');
  });
});
