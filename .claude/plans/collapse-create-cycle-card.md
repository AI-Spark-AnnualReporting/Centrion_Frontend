# Collapse the "Create Reporting Cycle" card by default

Repo: `/Users/ahmer/Documents/Work/centrion/Centrion_Frontend` (Vite, :8080, branch `staging`).
Frontend only.

## Context

`/annual-report` opens with the Create Reporting Cycle form fully expanded, pushing the actual
cycles list — the reason most people visit the page — below the fold. Creating a cycle is the rare
action; reading the list is the common one. The card is already collapsible (header click, rotating
chevron, `{open && …}` body), so this is about which state it starts in.

**Intended outcome:** the page opens on the list, with the create form one click away.

## Which repo — the trap memory already flags

There are two near-identical copies of this form. The one serving `:8080/annual-report` is
`Centrion_Frontend/src/pages/annual-report/CycleForm.tsx`; the Next.js app has a lookalike that is
**not** this screen. Confirmed by grepping the literal card title — only the Vite file matches.

## The change

**1. `src/pages/annual-report/CycleForm.tsx:38`** — `useState(true)` → `useState(false)`.
That is the whole feature. Everything below is fallout from it.

**2. Same file, the header (`:139-165`) has to become keyboard-operable.**
It is currently a bare `<div>` with `onClick` and `cursor: pointer` — no `role`, no `tabIndex`, no
key handler. Today that is merely sloppy, because the form is open on arrival and a keyboard user
can tab straight into the fields. Collapsing by default turns it into a lockout: the only control
that reveals the form cannot be reached by keyboard at all, so creating a cycle becomes
mouse-only.

So add `role="button"`, `tabIndex={0}`, `aria-expanded={open}`, and an `onKeyDown` handling Enter
and Space. Four lines, and this change is what creates the need for them — not scope creep.

**3. `src/test/cycle-form-pm-preselect.test.tsx`** — three tests currently pass and will all fail.
Each does `screen.getByRole("combobox")` or `findByText("Spark Staff (you)")` against the Project
Manager select, which lives **inside** the `{open && …}` body. Collapsed, it does not render.

Fix by expanding the card before asserting, not by weakening the assertions — the tests are
checking PM preselection, which is still correct and still worth pinning. React's synthetic events
bubble, so clicking the title text reaches the handler on the ancestor div:

```tsx
const openCard = () => fireEvent.click(screen.getByText("Create Reporting Cycle"))
```

Call it after each `render(...)`, and add a line to the file's header comment recording that the
card now starts collapsed — otherwise the next person reads the extra click as noise.

## Verification

From `/Users/ahmer/Documents/Work/centrion/Centrion_Frontend`:

1. `npx vitest run src/test/cycle-form-pm-preselect.test.tsx` — 3 passed today, expect 3 after.
2. `npm test` — full suite. Memory records a pre-existing red in `earnings-setup` on this repo;
   compare counts against a baseline run, do not expect green.
3. `npx tsc --noEmit -p tsconfig.app.json` — **must use `-p tsconfig.app.json`**; the bare form
   reports 0 because it checks nothing in this repo. Baseline on `staging` is **31 pre-existing
   errors** (memory says 11, which is stale — 31 is the live number). Expect 31 after.
4. `npm run lint`, then `npm run build`.

In the browser on `:8080/annual-report`:

5. Page opens with the card collapsed, chevron pointing down, cycles list visible without scrolling.
6. Click the header → expands, chevron rotates, the form is intact and the PM field still
   pre-selects the Spark user.
7. **Tab to the header and press Enter, then Space** — both must expand it. This is the regression
   the change would otherwise introduce.
8. Create a cycle end to end and confirm `onCreated` still navigates to the new cycle
   (`CyclesListPage.tsx:158`).
