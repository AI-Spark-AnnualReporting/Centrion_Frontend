# Compliance Certificate — Frontend Spec

**Goal:** Wire the two new compliance endpoints — the authed certificate PDF download, and the public certificate verification — and give the certificate an on-screen page that is the honest twin of the document.

Pairs with the backend note on `GET /compliance/runs/{run_id}/certificate.pdf` and `GET /api/v1/public/verify/{code}`.

Status: **implemented**. Branch `fix/design`.

---

## Scope

**In**
- `complianceValidation.certificatePdf(runId)` — authed blob fetch.
- `publicVerification.verify(code)` — unauthed lookup.
- `/compliance/runs/:runId/certificate` — the certificate page (protected).
- `/verify` and `/verify/:code` — public verification (unauthed, outside the app shell).
- Entry points from the gate screen.

**Out**
- Client-side generation of the verification ID. Removed as a concept — see §"The verification ID" below.
- The short `CNT-VAL-XXXXX-XXXXX` display format. Backend offered it behind a stored column + unique index; not requested.
- QR code on the certificate. Nothing to encode until `verification_code` is readable in the browser.

---

## 1. Certificate PDF download

```
GET /api/v1/compliance/runs/{run_id}/certificate.pdf
Authorization: Bearer <jwt>
→ 200 application/pdf
```

Authed **and** binary, so neither of the app's two normal paths works: `request()` parses the body as JSON or text, and a plain `<a href>` never attaches the token. It gets a bespoke `fetch`, modelled on `communications.sendRecipientsCsv`.

`src/lib/api.ts`:

```ts
complianceValidation.certificatePdf(runId): Promise<{ blob: Blob; filename: string | null }>
```

- 401 → `handleUnauthorized()`, same as every other call.
- Non-OK → parse the JSON body and throw `ApiError`, so the caller can read the server's own `detail` wording:

| Status | When | Rendered |
|---|---|---|
| 409 | run still running, or errored | server `detail`, else "This validation hasn't finished, so there is nothing to certify yet." |
| 403 | run belongs to another company | server `detail`, else "You don't have access to this validation run." |
| 404 | unknown `run_id` | server `detail`, else "This validation run no longer exists." |

### ⚠ `Content-Disposition` will not survive CORS by default

`Content-Disposition` is **not** a CORS-safelisted response header. The app runs cross-origin in every environment (Vite on `:5173` → `VITE_API_URL`), so `res.headers.get("Content-Disposition")` reads as `null` even though the header is on the wire.

**Backend ask:** add `Access-Control-Expose-Headers: Content-Disposition` to the response.

Until then `filename` comes back `null` and the caller names the file itself:

```
certificate-{period}-{report_type}.pdf     → certificate-Q1-2025-quarterly.pdf
```

`attachmentFilename()` prefers RFC 5987 `filename*=UTF-8''…` over the plain `filename="…"` form, since the latter can't carry the non-ASCII characters an Arabic report title would need.

### Not gated on `certified`

The endpoint serves any **finished** run and the document titles itself:

| run state | heading |
|---|---|
| `certified && publication_gate === 'open'` | "Validated & cleared for publication" |
| anything else | "Compliance validation report" + "It is NOT a clearance to publish" |

The screen branches on the same two fields via `isClearedForPublication(run)` in `src/types/compliance.ts`, so page and PDF cannot disagree. A user still working through gaps can take the detail away with them, and neither artefact overstates what it is.

---

## 2. Public verification

```
GET /api/v1/public/verify/{code}     (no auth)
```

`src/lib/api.ts` → `publicVerification.verify(code)`, using the existing `request(..., { auth: false })` opt-out. That flag earns its place twice here: it sends no token (correct for a public endpoint, and an anonymous visitor has none), and it keeps a 401 from bouncing that visitor to `/login`.

Code is normalised through `normalizeVerificationCode()` — trim + upper-case — before it goes in the path. The API tolerates both already; doing it here keeps stray whitespace out of the URL and makes the address bar shareable.

### One failure state, deliberately

The API answers an **identical 404** for a malformed code, an unknown code, and an unfinished run, so it can't be walked to discover which runs exist. The UI holds that line:

- No client-side format validation. A regex that rejected input before sending would hand a prober a faster oracle than the endpoint gives them.
- `notFound` is a boolean, not a message. One copy block: "We can't verify this ID."

**One distinction is kept**, and it is not about the code: a network failure renders separately from a 404. Telling someone their genuine certificate is unverifiable because our service was unreachable would be a serious thing to get wrong, so that case says so explicitly and says nothing about the certificate.

### Result rendering

A 200 is not automatically a green light — `certified` and `publication_gate` are separate facts:

| condition | banner |
|---|---|
| `certified && gate === 'open'` | ✓ "Genuine certificate" (green) |
| otherwise | ! "Genuine record — not cleared for publication" (amber) |

---

## The verification ID

**Nothing generates this client-side, and nothing should.** The real code is derived server-side from the run's 128-bit UUID in Crockford base32 and printed in the PDF. The browser doesn't know the derivation, and an invented ID resolves to nothing at `/verify`.

`GET /runs/{run_id}` does not return `verification_code`, so the certificate **page** cannot show one. In place of the ID line it says where the code lives:

> Verification ID is printed on the downloaded certificate

**Backend ask:** add `verification_code` to `GET /runs/{run_id}`. It's deterministic from `run_id`, so this is a field addition, not the stored-column migration. When it lands: render it in the footer under `MONO`, and the QR code becomes possible.

---

## Data the certificate page needs but `ComplianceRun` doesn't carry

`GET /runs/{run_id}` has no `title`, `period`, `entity_type`, `market`, `certified_at` or `certified_by`. Those live on the run **list** row.

Current handling: a second `listRuns(companyId, { limit: 50 })` call, matched on `run_id`. This resolves in practice — a just-certified run is at the top of a newest-first list — and degrades to the bare `report_type` when the run has aged out or the call fails. The card renders either way; a certificate is not worth failing over a title.

**Backend ask (lowest priority of the three):** `title` + `period` on `GET /runs/{run_id}`, which would drop the second call.

---

## Routing

```
/compliance/runs/:runId/certificate   protected · inside AppLayout · lazy
/verify                               PUBLIC · outside AppLayout · lazy
/verify/:code                         PUBLIC · outside AppLayout · lazy
```

The app's only `<Suspense>` boundary is inside `AppLayout`, which the public routes sit outside of by design. They get their own via a `PublicSuspense` layout route — without it the lazy import suspends with nothing to catch it.

`/verify/:code` checks on arrival (a followed link or a QR scan — the typing is already done). `/verify` takes a pasted code and pushes it into the URL on submit, so the result is shareable and survives a refresh.

---

## Entry points

| Surface | Control | When |
|---|---|---|
| Gate page, certified box | **View certificate →** (primary) | `run.certified` |
| Gate page, footer | **View validation report** (secondary) | `runDone && !run.certified` — covers the blocked and uncertified cases |
| Certificate page | **↓ Download certified report (PDF)** | always (the page only renders for finished runs) |

The certificate page redirects an unfinished run to `/compliance/runs/:runId/running`, matching what the gate page already does. Nothing on a certificate is true until the run finishes: the gate is null and every list is empty for the 30–60s it takes.

---

## Files

| File | Change |
|---|---|
| `src/types/compliance.ts` | `CertificateVerification`, `isClearedForPublication()`, `normalizeVerificationCode()` |
| `src/lib/api.ts` | `complianceValidation.certificatePdf()`, `attachmentFilename()`, `publicVerification` |
| `src/pages/compliance/CertificatePage.tsx` | new |
| `src/pages/VerifyCertificatePage.tsx` | new |
| `src/components/shared/CentriyonMark.tsx` | new — the logo lockup, extracted for the two surfaces that render outside the app shell |
| `src/pages/compliance/ComplianceGatePage.tsx` | two entry points |
| `src/App.tsx` | three routes + `PublicSuspense` |

---

## Open backend asks

1. `Access-Control-Expose-Headers: Content-Disposition` — otherwise every download uses the client fallback filename.
2. `verification_code` on `GET /runs/{run_id}` — unblocks the ID line and the QR code.
3. `title` + `period` on `GET /runs/{run_id}` — drops the second list call.
