// Row actions temporarily hidden from Users & Roles at the client's request.
// Flip either to true to bring it back — the handlers, API calls and backend
// routes behind them are untouched. Typed as `boolean` rather than inferred as
// the literal `false` so the JSX guards don't trip "always false" narrowing.
export const SHOW_CHANGE_ROLE: boolean = false;
export const SHOW_SUSPEND_USER: boolean = false;
