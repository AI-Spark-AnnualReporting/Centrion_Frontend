# BR32 profile editor — the two profile-picture states

## What you asked for

A member table where the picture state is obvious and actionable:

- **No picture** → `[ avatar placeholder ] [ Upload picture ]`, the upload action
  visible on the row, not hidden behind a pencil.
- **Picture exists** → `[ picture ] [ ✏ Edit ]` to change it.
- After an upload, the placeholder is replaced immediately and the pencil takes
  over.
- The whole thing clean and production-ready: consistent avatar size, aligned
  names, sane padding, hover/focus states, long names that do not break the
  layout.

---

## First, a premise that does not hold today

> "If a member's profile picture was successfully extracted from the CV…"

**Nothing is ever extracted.** `agents/narrative/board_cv_extractor.py`,
`_profile()`, sets:

```python
"photo_path":         None,
"photo_content_type": None,
```

and the editor's own header comment says why: *"A CV rarely carries a usable
photograph, which is why the picture is a field the operator fills rather than
something the extraction is expected to find."*

So the "picture exists" state is reachable **only after a person has uploaded
one**. That does not stop this work — both states are real, and the flow in your
§6 is exactly right once "extracted" is read as "already set". It only means the
happy path in §1 never fires on a fresh upload today.

Reading a portrait out of the CV is a separate, larger piece of work. See
"Not doing" below.

---

## What the editor looks like now

`src/pages/annual-report/BoardProfileTable.tsx` — one block per person:

```
┌─────────────────────────────────────────────────────────────┐
│ Photo            Name            Board title                │
│ ┌────────────┐   [input]         [input]                    │
│ │ 🧑         │                                              │
│ │ Add a photo│   ┌─ job ──────────────────────────────────┐ │
│ │ PNG or JPG │   │ Job title │ Company │ From │ To        │ │
│ │ [Browse]   │   │ What they did                          │ │
│ └────────────┘   └────────────────────────────────────────┘ │
│  168px wide                                                 │
└─────────────────────────────────────────────────────────────┘
```

Two problems against your spec:

1. The empty state is a **drop zone**, not a placeholder + a named action. It
   reads as "a file field", not as "this person has no picture yet".
2. It costs **168px** of every row, which is what pushed the job fields
   (140 + 140 + 128 + 128) tight in the first place.

The filled state is also wrong for you: a 40px thumbnail with a "Replace" button
and a "✕", no pencil.

---

## The change

### 1. A purpose-built photo cell, replacing `BrandUploadBox` here

The shared box is a drop target with a prompt, a hint and a Browse button. Your
spec wants an avatar with one clear action beside it. Those are different
controls, so this cell stops using it.

```
NO PICTURE                          PICTURE EXISTS
┌────────┐                          ┌────────┐
│   ◯    │  dashed, muted           │ [img]  │  solid, 10px radius
│  person│                          │        │
└────────┘                          └────────┘
 Upload picture                      ✏ Edit   ✕
```

- Avatar **56 × 56**, `border-radius: 10`, `object-fit: cover`, identical in both
  states so nothing shifts when a picture lands.
- Empty: dashed 1.5px border, muted ground, a person glyph. Under it a compact
  **"Upload picture"** button in the accent colour — visible, not hidden.
- Filled: the image, and under it **"✏ Edit"** plus a small **✕** to clear.
- The cell drops from **168px to 96px**, giving ~72px back to the fields on every
  row.
- Clicking the avatar itself opens the picker in both states, so the whole thing
  is one target.
- Same file rules as today: `LOGO_ACCEPT`, `validateLogoFile`, `readLogoFile`,
  1 MB, PNG/JPG. Nothing changes about what the server receives.

### 2. `BrandUploadBox`'s `stacked` variant is deleted

It was added yesterday for exactly this cell and has no other caller. Its CSS
(`.ob-drop-stacked`, `.ob-logo-preview-stacked`) goes with it, and so does the
test that pins it. The four brand call sites are untouched.

### 3. Row polish

- Person block header laid out as **avatar · name · board title · remove**, one
  consistent height, so the list reads as rows rather than stacked cards.
- `min-width: 0` on the text column so a long name ellipsises instead of pushing
  the row wide.
- Hover raises the row ground very slightly; every button gets a visible
  `:focus-visible` ring.
- `aria-label` on both photo actions naming the person, so a screen reader can
  tell one row's Upload from another's.

### 4. What does NOT change

- The API. `photo_base64` in, `photo_path` stored, `photo_data_uri` back — all
  untouched.
- The printed report. Photo is already the first column and already appears only
  when at least one director has one.
- The job editor below each person.

---

## Not doing (flagging, not sneaking in)

**Reading a portrait out of the CV.** A `.docx` carries its images as related
parts and a `.pdf` as embedded XObjects, so pulling the bytes out is easy. The
hard half is deciding *which person* an image belongs to, and whether it is a
portrait at all rather than a logo, a chart or a decorative rule. For a
one-person CV it is "the largest portrait-shaped image"; for a five-director
pack it is a matching problem against document position. It is a real feature,
not a line of code, and it needs its own plan. Say the word and I will write one.

---

## What could break

- Anyone relying on drag-and-drop onto the photo cell loses it — the new control
  is click-to-pick. Dragging a file onto a 56px avatar was never a good target.
- `BrandUploadBox`'s `stacked` prop disappears. No caller outside this file uses
  it; the test that covers it is removed with it.
- Nothing server-side, so no re-produce and no re-upload is needed to see it.

---

## Tests

1. A profile with no photo renders the placeholder **and** a visible "Upload
   picture" action — the assertion that the action is not hidden.
2. A profile with a photo renders the image and an **Edit** action, and no
   "Upload picture".
3. Picking a file calls through with the data URI, and the row switches to the
   filled state without a save.
4. Clearing removes the picture and the row returns to placeholder + "Upload
   picture".
5. A long name does not widen the row (the text column carries `min-width: 0`).
