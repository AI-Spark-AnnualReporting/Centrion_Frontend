/** Department codes derived from a department's name.
 *
 *  Used wherever the product offers a department the company's annual report implies: the
 *  banner exists to remove friction, and making someone invent a code by hand right after
 *  clicking a name puts it straight back.
 *
 *  Lives in lib/ rather than beside the modal because both callers need it now — the
 *  Add Department form (pages/admin) and the batch add behind the banner (lib/), which is
 *  rendered from components/shared.
 */

// The create form and the backend both cap the code at 10 characters.
const MAX_CODE = 10;

// Dropped when building initials, so "Health, Safety, Security and Environment" gives
// HSSE rather than HSSAE.
const MINOR_WORDS = new Set(['and', 'of', 'the', 'for', 'in', 'on', 'at', 'to', 'a', 'an']);

function alnum(name: string): string {
  return (name || '')
    .split('')
    .filter((ch) => /[a-z0-9]/i.test(ch))
    .join('')
    .toUpperCase();
}

/** First three letters of a department name, as its code: "Legal Department" -> "LEG".
 *
 *  Letters and digits only, so "Technology & Innovation" gives TEC rather than "TE&".
 *  Names shorter than three characters keep whatever they have — the field is required and
 *  a two-letter code is a real one here ("HR" is the system default for Human Resources).
 *
 *  This is a starting point the user edits before submitting.
 */
export function codeFromName(name: string): string {
  return alnum(name).slice(0, 3);
}

/** Every code we would accept for this name, best first.
 *
 *  Only the first is ever put in front of a user (the modal prefill). The rest exist for
 *  "Add all", which has to land on a code that is actually free — and "free" is not what
 *  the departments list says it is: a DELETED department keeps its row (is_active=false)
 *  and therefore its code, is filtered out of GET /admin/departments, and still collides
 *  on insert with a 400. So the batch walks this list until one sticks instead of failing
 *  the way a single fixed code would.
 */
export function codeCandidates(name: string): string[] {
  const letters = alnum(name);
  const initials = (name || '')
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .filter((w) => !MINOR_WORDS.has(w.toLowerCase()))
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, MAX_CODE);

  const out: string[] = [];
  const push = (c: string) => {
    if (c && !out.includes(c)) out.push(c.slice(0, MAX_CODE));
  };

  push(codeFromName(name)); // what the form would have prefilled — keep the two in step
  push(initials); // "Health, Safety, Security and Environment" -> HSSE
  push(letters.slice(0, 4));
  push(letters.slice(0, 5));
  if (!out.length) push('DEPT'); // a name with no letters or digits at all

  // Last resort: the preferred code with a counter. Never runs out, never exceeds 10.
  const base = out[0].slice(0, MAX_CODE - 1);
  for (let n = 2; n <= 9; n += 1) push(`${base}${n}`);

  return out;
}
