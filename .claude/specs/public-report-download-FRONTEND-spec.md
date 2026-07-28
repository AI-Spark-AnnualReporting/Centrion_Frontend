# Public Report Download — Frontend Spec (minimal)

**Goal:** The investor email shows a **Download report** button that links to the public download URL. Clicking it downloads the PDF. No preview page.

Pairs with the backend spec (`GET /api/public/reports/{report_id}/download`).

---

## Scope

**In**
- The **Download report** button in the composer's "What the investor receives" preview (React).
- The matching button markup in the **sent email HTML** (email-safe, inline CSS).
- Building the absolute download URL from `report_id`.

**Out**
- No public preview/landing page — the link goes straight to the backend, which streams the PDF. The browser handles the download.
- No auth, no token handling on the client.
- PDF rendering (backend).

---

## Two surfaces (keep them identical)

1. **Composer preview** (React, `claude.ai`-style panel on the right of the screenshot) — a live mock of the email. Its Download button is a real `<a>` so the sender can test-download.
2. **Sent email HTML** (rendered at send time — see backend §"Email link"). Same button, but written with **inline styles** because email clients strip `<style>`/classes.

Define the button once as a shared snippet so both surfaces match.

---

## Download URL

Absolute (email clients need a full URL):

```
`${APP_BASE_URL}/api/public/reports/${reportId}/download`
```

- `APP_BASE_URL` from env (`NEXT_PUBLIC_APP_URL` / `PUBLIC_BASE_URL`), e.g. `https://app.centriyon.com`.
- `reportId` = the report attached to the email (the composer already has it — same id the send flow writes to `email_sends.report_id`).
- No `download` attribute needed; the backend sets `Content-Disposition: attachment`, so the browser downloads regardless.

---

## The Download button

Replace the current dual **View report** button + **Download · PDF** link with a **single primary CTA: “Download report”** (download-only feature — no view page).

**Component (composer preview)**

```tsx
type DownloadReportButtonProps = {
  reportId: string;
  reportLabel: string;        // e.g. "FY-2025 Annual"
  disabled?: boolean;         // no report attached / not downloadable
};

function DownloadReportButton({ reportId, reportLabel, disabled }: DownloadReportButtonProps) {
  const href = `${process.env.NEXT_PUBLIC_APP_URL}/api/public/reports/${reportId}/download`;
  if (disabled) {
    return <span className="report-cta report-cta--disabled">Download report</span>;
  }
  return (
    <a className="report-cta" href={href} target="_blank" rel="noopener noreferrer">
      Download report
    </a>
  );
}
```

**States**
- **Enabled** — a report is attached and downloadable → live `<a>`.
- **Disabled** — no report attached (composer has no `reportId`) → non-clickable, muted. Optional: also disable when the report isn’t ready to download (sender-side hint; the backend still 404s if not).

**Style** (house system: deep violet `#3C0866`, cyan `#5BC9E2`, DM Sans)
- Primary button: solid `#3C0866` bg, white text, ~10px radius, ~12–14px/20–24px padding, DM Sans 600.
- Hover: slightly lighter violet or cyan accent border.
- Disabled: `#E5E2EC` bg, `#9A93A8` text, no pointer.
- Report card keeps the small PDF glyph + `reportLabel`; the CTA sits on the right (as in the screenshot).

---

## Email-safe button (sent HTML)

Same look, inline-styled, table-wrapped for Outlook. Backend drops `download_url` in here:

```html
<a href="{{download_url}}"
   style="display:inline-block;background:#3C0866;color:#ffffff;
          font-family:'DM Sans',Arial,sans-serif;font-weight:600;font-size:14px;
          line-height:20px;text-decoration:none;padding:12px 20px;border-radius:10px;">
  Download report
</a>
```

Keep the visible fallback line beneath it (some clients hide buttons): `Or paste this link: {{download_url}}`.

---

## Composer integration

- The composer already selects/attaches the report → it has `reportId`. Pass it to `DownloadReportButton` in the preview panel.
- No change to the send action beyond the backend injecting `download_url` into the email template (backend §"Email link").
- If the composer supports "Save draft", the URL is deterministic from `reportId`, so nothing extra to persist.

---

## Config

```
NEXT_PUBLIC_APP_URL=https://app.centriyon.com
```

---

## Acceptance criteria

- [ ] Composer preview shows a single **Download report** button (no View/Download split).
- [ ] Button `href` = `${APP_BASE_URL}/api/public/reports/${reportId}/download`.
- [ ] Clicking it downloads the PDF (browser handles `Content-Disposition: attachment`).
- [ ] Button is disabled/muted when no report is attached.
- [ ] Sent email uses the inline-styled version + a plain-text fallback link.
- [ ] Preview and sent-email buttons look identical.

---

## Tasks (for Claude Code)

1. `DownloadReportButton` component (href from `reportId`, enabled/disabled states, house styling).
2. Swap the preview panel's View/Download controls for this single CTA.
3. Email template: inline-styled button + fallback link, fed `download_url` from the send flow.
4. Config: `NEXT_PUBLIC_APP_URL`.
5. Verify: enabled link downloads; disabled state when `reportId` absent; preview matches sent email.
