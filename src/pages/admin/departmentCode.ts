/** First three letters of a department name, as its code: "Legal Department" -> "LEG".
 *
 *  Used when someone picks a department out of the annual-report suggestions banner: the
 *  banner exists to remove friction, and making them invent a code by hand right after
 *  clicking a name puts it straight back.
 *
 *  Letters and digits only, so "Technology & Innovation" gives TEC rather than "TE&".
 *  Names shorter than three characters keep whatever they have — the field is required and
 *  a two-letter code is a real one here ("HR" is the system default for Human Resources).
 *
 *  This is a starting point the user edits before submitting. We never submit it for them,
 *  and we never create a department on their behalf.
 *
 *  Lives in its own file rather than beside the modal so the page keeps exporting only its
 *  component — the same reason annual-report/departmentLead.ts sits apart from its section.
 */
export function codeFromName(name: string): string {
  return (name || '')
    .split('')
    .filter((ch) => /[a-z0-9]/i.test(ch))
    .join('')
    .slice(0, 3)
    .toUpperCase();
}
