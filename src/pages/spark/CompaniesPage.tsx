// The company directory — where a `spark_internal` (Spark staff) session lands.
//
// Spark accounts carry no company of their own, so this is the one page that
// means anything before they pick one. Choosing a company sets the acting
// company (AuthContext.switchCompany) and drops them straight into that
// client's annual report, which is the work this role exists to do.
//
// The four numbers at the top all come off the same request as the rows — see
// the route docstring. They are deliberately the ones the system actually
// maintains: nothing ever writes a cycle's 'completed' status, so a "delivered"
// card would read 0 for ever.
//
// No status pill and no progress bar per company: a directory is for finding a
// client, not judging one.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { Spinner } from "@/components/shared/Spinner";
import { TempPasswordPlate } from "@/components/shared/TempPasswordPlate";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/context/AuthContext";
import {
  extractProfileAtSignup,
  sparkInternal,
  type CreateSparkCompanyPayload,
  type SparkCompanyRow,
  type SparkDirectoryStats,
} from "@/lib/api";
import { gradientFor, initialsOf } from "@/lib/avatar";
import { SPARK_TEMP_PASSWORD, suggestAdminEmail, suggestPmEmail } from "@/lib/sparkLogins";
import CompanyLoginsDialog from "./CompanyLoginsDialog";

const PRIMARY = "#4040C8";

// Above the onboarding wizard (`.auth`, z-index 100) and any other modal
// overlay (10001). Inline, because `.modal-overlay` sets its own z-index.
const MODAL_Z_INDEX = 10002;

// Server-side, not a view of one list: each tab is its own request, so the
// stat tiles above describe whatever is listed underneath them. Which is also
// why the tabs carry no counts — only one scope's total is known at a time, and
// the Companies tile already shows it.
type Filter = "mine" | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "mine", label: "Yours" },
  { key: "all", label: "All" },
];

// Pins are a per-user view preference, so they live in this browser, keyed by
// user — not on the server. They follow the company id, so renames are safe.
const pinsKey = (userId: string | undefined) => `centriyon:pinned-companies:${userId ?? "anon"}`;

function loadPins(userId: string | undefined): string[] {
  try {
    const raw = localStorage.getItem(pinsKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const th: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "#9BA3C4",
  textTransform: "uppercase",
  letterSpacing: ".5px",
  textAlign: "left",
  padding: "12px 16px",
};

const td: React.CSSProperties = { fontSize: 12, color: "#1A1D2E", padding: "14px 16px" };

function StatTile({
  icon,
  value,
  label,
  hint,
  amber,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  hint: string;
  amber?: boolean;
}) {
  return (
    <div
      className="card"
      style={{
        flex: 1,
        minWidth: 0,
        padding: 16,
        ...(amber ? { background: "#FFFBEB", borderColor: "#FCE7B0" } : {}),
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: amber ? "rgba(245,158,11,.14)" : "#EEEEFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: amber ? "#B45309" : PRIMARY,
          marginBottom: 12,
        }}
      >
        {icon}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 800,
          color: amber ? "#B45309" : "#1A1D2E",
          lineHeight: 1,
          fontFamily: "'DM Mono', monospace",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#1A1D2E", marginTop: 8 }}>{label}</div>
      <div style={{ fontSize: 11, color: "#9BA3C4", marginTop: 2 }}>{hint}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add company modal (with the optional "Company admin login" section)
// ---------------------------------------------------------------------------

/** Where the admin email check stands. 'idle' = nothing to show (switch off,
 *  no email yet, or inside the 400 ms wait). */
type EmailStatus = "idle" | "checking" | "available" | "taken" | "invalid" | "failed";

/** Wait after the last keystroke before asking the server about the email. */
const EMAIL_CHECK_DELAY_MS = 400;

const ADMIN_BODY_ID = "add-company-admin-body";
const ADMIN_SUBTITLE_ID = "add-company-admin-subtitle";
const EMAIL_STATUS_ID = "add-company-email-status";
const FOOTER_HINT_ID = "add-company-footer-hint";

/**
 * A quick client-side shape check: exactly one `@`, no spaces, something on
 * both sides. The server does the real check; this only saves a request.
 */
function isEmailShapeValid(email: string): boolean {
  const trimmed = email.trim();
  if (/\s/.test(trimmed)) return false;
  const parts = trimmed.split("@");
  if (parts.length !== 2) return false;
  return parts[0] !== "" && parts[1] !== "";
}

/** The HTTP status of a thrown API error, or null. Duck-typed on purpose:
 *  the page's tests mock `@/lib/api` without `ApiError`. */
function statusOf(error: unknown): number | null {
  if (error && typeof error === "object" && typeof (error as { status?: unknown }).status === "number") {
    return (error as { status: number }).status;
  }
  return null;
}

/** The `suggestion` from a 409 body `{detail: {message, suggestion}}`, or null. */
function suggestionFromConflict(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const body = (error as { body?: unknown }).body;
  if (!body || typeof body !== "object") return null;
  const detail = (body as { detail?: unknown }).detail;
  if (!detail || typeof detail !== "object") return null;
  const suggestion = (detail as { suggestion?: unknown }).suggestion;
  return typeof suggestion === "string" && suggestion !== "" ? suggestion : null;
}

/** True when the user asked the OS for less motion. Safe where matchMedia is missing. */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The 14px key icon used by the admin section and the row Logins button. */
function KeyIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" aria-hidden="true">
      <circle cx="5.5" cy="10.5" r="3" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M7.6 8.4L13.5 2.5M11.5 4.5l1.6 1.6M10 6l1.2 1.2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const TEXT_LINK: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  fontSize: 11,
  fontWeight: 700,
  color: PRIMARY,
  cursor: "pointer",
};

/**
 * One muted line under the admin email: the server also makes a project
 * manager login whenever it makes the admin. There is no PM field, so this is
 * the only place Spark staff learn about it before Create. The email follows
 * the company name (not the admin email box) because that is what the server
 * slugs; it may still add `-2` when the first one is taken.
 */
function PmLoginNote({ companyName }: { companyName: string }) {
  const hasName = companyName.trim() !== "";
  return (
    <div
      data-testid="pm-login-note"
      style={{ fontSize: 11, color: "#5A6080", lineHeight: 1.5, marginTop: 2 }}
    >
      A project manager login
      {hasName && (
        <>
          {" ("}
          <b style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: "#1A1D2E", wordBreak: "break-all" }}>
            {suggestPmEmail(companyName)}
          </b>
          {")"}
        </>
      )}{" "}
      is made too, with the same password.
    </div>
  );
}

/** The status line under the admin email. Its height is reserved so nothing jumps. */
function EmailStatusLine({
  status,
  suggestion,
  serverMessage,
  onUseSuggestion,
  onRetry,
  disabled,
}: {
  status: EmailStatus;
  suggestion: string | null;
  serverMessage: string;
  onUseSuggestion: (email: string) => void;
  onRetry: () => void;
  disabled: boolean;
}) {
  let content: React.ReactNode = null;
  if (serverMessage) {
    content = <span style={{ color: "#E5484D" }}>{serverMessage}</span>;
  } else if (status === "checking") {
    content = (
      <>
        <span
          className="spinner"
          aria-hidden="true"
          style={{ width: 10, height: 10, borderWidth: 2, display: "inline-block" }}
        />
        <span style={{ color: "#9BA3C4" }}>Checking…</span>
      </>
    );
  } else if (status === "available") {
    content = (
      <>
        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: "#16A34A" }} />
        <span style={{ color: "#16A34A" }}>Available</span>
      </>
    );
  } else if (status === "taken") {
    content = (
      <>
        <span style={{ color: "#E5484D" }}>Already used.</span>
        {suggestion && (
          <button
            type="button"
            className="hover:underline"
            style={TEXT_LINK}
            disabled={disabled}
            onClick={() => onUseSuggestion(suggestion)}
          >
            Use {suggestion}
          </button>
        )}
      </>
    );
  } else if (status === "invalid") {
    content = <span style={{ color: "#E5484D" }}>Enter a valid email.</span>;
  } else if (status === "failed") {
    content = (
      <>
        <span style={{ color: "#B45309" }}>Couldn&apos;t check this email.</span>
        <button type="button" className="hover:underline" style={TEXT_LINK} disabled={disabled} onClick={onRetry}>
          Retry
        </button>
      </>
    );
  }

  return (
    <div
      id={EMAIL_STATUS_ID}
      data-testid="admin-email-status"
      aria-live="polite"
      style={{
        minHeight: 18,
        marginTop: 5,
        fontSize: 11,
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
      }}
    >
      {content}
    </div>
  );
}

function AddCompanyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (company: { id: string; name: string }) => void;
}) {
  const [name, setName] = useState("");
  const [jurisdiction, setJurisdiction] = useState("KSA");
  const [website, setWebsite] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Admin login section. Off by default (spec: both toggles default to No).
  const [adminOn, setAdminOn] = useState(false);
  // The email follows the company name until the user types in it.
  const [emailEdited, setEmailEdited] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  // A 422 about the email from the create call. Cleared when the email changes.
  const [emailServerMessage, setEmailServerMessage] = useState("");
  const [checkTick, setCheckTick] = useState(0);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const adminBodyRef = useRef<HTMLDivElement>(null);
  // Set right before an email change that must be checked at once (a clicked
  // suggestion, Retry), so the effect below skips the 400 ms wait that one time.
  const checkNowRef = useRef(false);

  let adminEmail = emailInput;
  if (!emailEdited) {
    adminEmail = name.trim() ? suggestAdminEmail(name) : "";
  }

  // Ask the server whether the admin email is free, 400 ms after the last
  // change. Only while the switch is on. The `live` flag drops the answer for
  // an older value, so a slow reply can't overwrite a newer status.
  useEffect(() => {
    const checkNow = checkNowRef.current;
    checkNowRef.current = false;
    if (!adminOn || adminEmail.trim() === "") {
      setEmailStatus("idle");
      return;
    }
    if (!isEmailShapeValid(adminEmail)) {
      setEmailStatus("invalid");
      return;
    }
    let live = true;
    setEmailStatus("idle");
    const timer = setTimeout(
      () => {
        if (!live) return;
        setEmailStatus("checking");
        sparkInternal
          .emailAvailable(adminEmail.trim())
          .then((result) => {
            if (!live) return;
            if (!result.valid) {
              setEmailStatus("invalid");
            } else if (result.available) {
              setEmailStatus("available");
            } else {
              setSuggestion(result.suggestion);
              setEmailStatus("taken");
            }
          })
          .catch(() => {
            if (live) setEmailStatus("failed");
          });
      },
      checkNow ? 0 : EMAIL_CHECK_DELAY_MS,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [adminOn, adminEmail, checkTick]);

  // Collapsed fields must not be reachable with Tab. React 18 has no `inert`
  // prop, so it is set on the element directly.
  useEffect(() => {
    if (adminBodyRef.current) adminBodyRef.current.inert = !adminOn;
  }, [adminOn]);

  /** Turn the admin section on or off. */
  function toggleAdmin(checked: boolean): void {
    setAdminOn(checked);
  }

  /** The user typed in the email: stop following the company name. */
  function changeEmail(value: string): void {
    setEmailInput(value);
    setEmailEdited(true);
    setEmailServerMessage("");
  }

  /** Go back to the email made from the company name. */
  function useSuggestedEmail(): void {
    setEmailEdited(false);
    setEmailServerMessage("");
  }

  /** Fill in the server's free alternative and check it straight away. */
  function useAlternativeEmail(email: string): void {
    checkNowRef.current = true;
    setEmailInput(email);
    setEmailEdited(true);
    setEmailServerMessage("");
    emailInputRef.current?.focus();
  }

  /** Check the same email again after a network failure. */
  function retryEmailCheck(): void {
    checkNowRef.current = true;
    setCheckTick((tick) => tick + 1);
  }

  // Why Create is disabled while the admin section is on, first reason that
  // applies. null = nothing blocks it. A failed check doesn't block: the
  // server checks again and is the authority.
  let blockReason: string | null = null;
  if (adminOn) {
    const emailReady = emailStatus === "available" || emailStatus === "failed";
    if (!name.trim()) {
      blockReason = "Add a company name first.";
    } else if (emailServerMessage || emailStatus === "taken" || emailStatus === "invalid" || adminEmail.trim() === "") {
      blockReason = "Pick an email that isn't used yet.";
    } else if (!emailReady) {
      blockReason = "Waiting for the email check…";
    }
  }
  const createDisabled = saving || blockReason !== null;

  /** Show a failed create in the right place: the email line or the callout. */
  function showCreateError(failure: unknown): void {
    const status = statusOf(failure);
    const message = failure instanceof Error ? failure.message : "Could not create the company.";
    if (adminOn && status === 409) {
      // Someone took the email between the check and Create.
      setSuggestion(suggestionFromConflict(failure));
      setEmailStatus("taken");
      return;
    }
    if (adminOn && status === 422 && /email/i.test(message)) {
      setEmailServerMessage(message);
      return;
    }
    setError(message);
  }

  /**
   * Same as signup step 2: save the website to companies.website_url and start
   * the background read that pre-fills the company profile for the wizard.
   * Best-effort: a failure here must never stop the wizard from opening.
   */
  async function startWebsiteRead(companyId: string, url: string): Promise<void> {
    if (!url.trim()) return;
    try {
      await extractProfileAtSignup(companyId, null, url);
    } catch {
      // The wizard falls back to manual entry, as it does after signup.
    }
  }

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Company name is required.");
      return;
    }
    if (createDisabled) return;
    setSaving(true);
    setError("");
    // With the switch off, `admin` is left out so the request is exactly the old one.
    const payload: CreateSparkCompanyPayload = { name: trimmed, jurisdiction: jurisdiction.trim() || null };
    if (adminOn) {
      // The server gives the admin the fixed Spark password (1234).
      payload.admin = { email: adminEmail.trim() };
    }
    sparkInternal
      .createCompany(payload)
      .then(async (res) => {
        await startWebsiteRead(res.company.id, website);
        onCreated(res.company);
      })
      .catch((failure) => {
        showCreateError(failure);
        setSaving(false);
      });
  };

  /** Enter in the name or email field submits, but only when Create could be clicked. */
  function submitOnEnter(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== "Enter") return;
    if (adminOn && createDisabled) return;
    submit();
  }

  // Escape closes only an untouched modal, so a half-filled form is never lost.
  const escapeCloses = !saving && !adminOn && name.trim() === "";
  const reduceMotion = prefersReducedMotion();
  let bodyTransition = "none";
  if (!reduceMotion) {
    bodyTransition = adminOn
      ? "grid-template-rows 200ms cubic-bezier(.22,.61,.36,1)"
      : "grid-template-rows 160ms ease-in";
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && escapeCloses) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" style={{ zIndex: MODAL_Z_INDEX }}>
          <Dialog.Content
            className="modal-content analysis-pop"
            style={{ width: 480, maxWidth: "96vw", position: "relative" }}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              nameInputRef.current?.focus();
            }}
            onEscapeKeyDown={(event) => {
              if (!escapeCloses) event.preventDefault();
            }}
            // A click outside must never throw away a half-filled form (same as InviteModal).
            onInteractOutside={(event) => event.preventDefault()}
          >
            <div style={{ padding: "20px 64px 14px 24px" }}>
              <Dialog.Title style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>
                Add company
              </Dialog.Title>
              <Dialog.Description style={{ fontSize: 12, color: "#5A6080", marginTop: 4 }}>
                Creates the company, then takes you through its setup. You stay logged in.
              </Dialog.Description>
            </div>

            <div style={{ padding: "4px 24px 8px" }}>
              <label className="fl-label" htmlFor="add-company-name">
                Company name
              </label>
              <input
                id="add-company-name"
                ref={nameInputRef}
                className="inp"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={submitOnEnter}
                placeholder="Acme Corporation"
                disabled={saving}
                style={{ marginBottom: 14 }}
              />

              <label className="fl-label" htmlFor="add-company-jurisdiction">
                Jurisdiction
              </label>
              <input
                id="add-company-jurisdiction"
                className="inp"
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value)}
                disabled={saving}
                style={{ marginBottom: 14 }}
              />

              <label className="fl-label" htmlFor="add-company-website">
                Website <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
              </label>
              <input
                id="add-company-website"
                className="inp"
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder="https://company.com"
                maxLength={500}
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                onKeyDown={submitOnEnter}
                disabled={saving}
                style={{ marginBottom: 14 }}
              />

              {/* Company admin login */}
              <div
                data-testid="admin-login-section"
                style={{
                  border: `1.5px solid ${adminOn ? "#C7CBF0" : "#E2E4F0"}`,
                  borderRadius: 12,
                  background: adminOn ? "#fff" : "#FAFBFE",
                  transition: "border-color .15s, background .15s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
                  <label
                    htmlFor="add-company-admin-switch"
                    style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, cursor: "pointer" }}
                  >
                    <span
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 7,
                        background: "#EEEEFF",
                        color: PRIMARY,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <KeyIcon />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#1A1D2E" }}>
                        Company admin login
                      </span>
                      <span id={ADMIN_SUBTITLE_ID} style={{ display: "block", fontSize: 11, color: "#9BA3C4", marginTop: 1 }}>
                        Create a normal admin account for this client
                      </span>
                    </span>
                  </label>
                  <Switch
                    id="add-company-admin-switch"
                    data-testid="admin-login-switch"
                    checked={adminOn}
                    onCheckedChange={toggleAdmin}
                    disabled={saving}
                    aria-describedby={ADMIN_SUBTITLE_ID}
                    aria-controls={ADMIN_BODY_ID}
                    className="data-[state=checked]:bg-[#4040C8] data-[state=unchecked]:bg-[#D8DBEA]"
                    style={{ marginLeft: "auto" }}
                  />
                </div>

                {/* Grid rows 0fr -> 1fr animates the height without measuring it. */}
                <div style={{ display: "grid", gridTemplateRows: adminOn ? "1fr" : "0fr", transition: bodyTransition }}>
                  <div
                    id={ADMIN_BODY_ID}
                    ref={adminBodyRef}
                    aria-hidden={!adminOn}
                    style={{
                      overflow: "hidden",
                      minHeight: 0,
                      opacity: adminOn ? 1 : 0,
                      transition: reduceMotion ? "none" : adminOn ? "opacity 150ms ease 50ms" : "opacity 120ms ease-in",
                    }}
                  >
                    <div style={{ padding: "12px 14px 14px", borderTop: "1px solid #ECEEF8" }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                        <label className="fl-label" htmlFor="add-company-admin-email">
                          Admin email
                        </label>
                        {emailEdited && (
                          <button
                            type="button"
                            className="hover:underline"
                            style={TEXT_LINK}
                            onClick={useSuggestedEmail}
                            disabled={saving}
                          >
                            Use suggested
                          </button>
                        )}
                      </div>
                      <input
                        id="add-company-admin-email"
                        ref={emailInputRef}
                        className={
                          emailStatus === "taken" || emailStatus === "invalid" || emailServerMessage
                            ? "inp inp-error"
                            : "inp"
                        }
                        type="email"
                        autoComplete="off"
                        value={adminEmail}
                        onChange={(e) => changeEmail(e.target.value)}
                        onKeyDown={submitOnEnter}
                        placeholder="company@admin.com"
                        disabled={saving}
                        aria-describedby={EMAIL_STATUS_ID}
                      />
                      <EmailStatusLine
                        status={emailStatus}
                        suggestion={suggestion}
                        serverMessage={emailServerMessage}
                        onUseSuggestion={useAlternativeEmail}
                        onRetry={retryEmailCheck}
                        disabled={saving}
                      />
                      <PmLoginNote companyName={name} />

                      <div className="fl-label" style={{ marginTop: 14 }}>
                        Temporary password
                      </div>
                      <TempPasswordPlate password={SPARK_TEMP_PASSWORD} size="md" disabled={saving} />

                      <div
                        style={{
                          fontSize: 11,
                          color: "#B45309",
                          background: "rgba(245,158,11,.1)",
                          borderRadius: 8,
                          padding: "8px 10px",
                          lineHeight: 1.5,
                          marginTop: 12,
                        }}
                      >
                        The admin, the project manager and every department lead sign in with this the
                        first time, then set their own.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  style={{
                    marginTop: 12,
                    fontSize: 11,
                    color: "#DC2626",
                    background: "rgba(239,68,68,.08)",
                    border: "1px solid rgba(239,68,68,.2)",
                    borderRadius: 8,
                    padding: "8px 12px",
                  }}
                >
                  {error}
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 24px 18px",
                borderTop: "1px solid #ECEEF8",
                marginTop: 10,
              }}
            >
              <div id={FOOTER_HINT_ID} style={{ fontSize: 11, color: "#9BA3C4", minWidth: 0 }}>
                {!saving && blockReason ? blockReason : ""}
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button type="button" className="btn bs" onClick={onClose} disabled={saving}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn bp"
                  onClick={submit}
                  disabled={createDisabled}
                  aria-describedby={blockReason ? FOOTER_HINT_ID : undefined}
                >
                  {saving ? "Creating…" : "Create and set up →"}
                </button>
              </div>
            </div>

            {/* Last in the DOM so Tab reaches it after Create (ui.md tab order). */}
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              disabled={saving}
              style={{
                position: "absolute",
                top: 20,
                right: 24,
                width: 28,
                height: 28,
                borderRadius: "50%",
                border: "1.5px solid #E2E4F0",
                background: "#fff",
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              ✕
            </button>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default function SparkCompaniesPage() {
  const navigate = useNavigate();
  const { user, switchCompany, leaveCompany, actingCompany } = useAuth();
  const userId = user?.user_id;
  const [pinned, setPinned] = useState<string[]>(() => loadPins(userId));
  const [companies, setCompanies] = useState<SparkCompanyRow[]>([]);
  const [stats, setStats] = useState<SparkDirectoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("mine");
  const [adding, setAdding] = useState(false);
  // The company whose Logins dialog is open (only Spark-created rows have one).
  const [loginsFor, setLoginsFor] = useState<{ id: string; name: string } | null>(null);

  // Catch-all: the sidebar button and the "Acting as" chip already clear before
  // navigating, but browser-back and a typed URL can land here with a company
  // still selected, and the directory must never be shown from inside a client.
  // Costs a remount on that path (AppLayout is keyed on the acting company), so
  // the click paths deliberately clear first instead of relying on this.
  //
  // ON MOUNT ONLY. Depending on `actingCompany` would make this fire the instant
  // a row sets it and wipe the selection before the navigate lands.
  useEffect(() => {
    if (actingCompany) leaveCompany();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-runs on the tab, because the scope is the server's to decide — the stats
  // are computed from whichever companies it returns, so they cannot be narrowed
  // here. Re-arm `loading` or the stale list stays on screen under new numbers.
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    sparkInternal
      .companies({ mine: filter === "mine" })
      .then((res) => {
        if (!live) return;
        setCompanies(res.companies ?? []);
        setStats(res.stats ?? null);
      })
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : "Failed to load companies.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [filter]);

  useEffect(() => {
    setPinned(loadPins(userId));
  }, [userId]);

  const togglePin = (id: string) => {
    setPinned((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(pinsKey(userId), JSON.stringify(next));
      } catch {
        // Storage blocked — the pin still holds for this visit.
      }
      return next;
    });
  };

  // Search only — the tab is applied server-side. Pinned companies float to the
  // top; the sort is stable, so each group keeps the server's order.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = q
      ? companies.filter((c) => (c.name ?? "").toLowerCase().includes(q))
      : companies;
    return [...matched].sort(
      (a, b) => Number(pinned.includes(b.id)) - Number(pinned.includes(a.id)),
    );
  }, [companies, search, pinned]);

  // Enter a company and go where its work actually is — its annual report,
  // not the Command Center.
  const open = (c: SparkCompanyRow) => {
    switchCompany({ id: c.id, name: c.name });
    navigate("/annual-report");
  };

  // A brand-new company has nothing to report on yet, so go to setup instead.
  const openNew = (c: { id: string; name: string }) => {
    switchCompany(c);
    navigate("/onboarding");
  };

  return (
    <div style={{ paddingBottom: 96 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1A1D2E", margin: 0 }}>
            Companies
          </h1>
          <p style={{ fontSize: 12, color: "#5A6080", marginTop: 2 }}>
            Pick a client to work inside, or add a new one.
          </p>
        </div>
        <button type="button" className="btn bp" onClick={() => setAdding(true)}>
          + Add company
        </button>
      </div>

      {/* Headline numbers */}
      <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
        <StatTile
          icon={
            <svg viewBox="0 0 14 14" width="15" height="15" fill="none">
              <rect x="1.5" y="4" width="4.5" height="8.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
              <rect x="8" y="1.5" width="4.5" height="11" rx="1" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          }
          value={stats?.companies ?? "—"}
          label="Companies"
          hint="client workspaces"
        />
        <StatTile
          icon={
            <svg viewBox="0 0 14 14" width="15" height="15" fill="none">
              <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3" />
              <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          }
          value={stats?.active_cycles ?? "—"}
          label="Active cycles"
          hint={
            stats
              ? `across ${stats.active_client_count} ${stats.active_client_count === 1 ? "client" : "clients"}`
              : "in progress"
          }
        />
        <StatTile
          amber={!!stats?.past_deadline}
          icon={
            <svg viewBox="0 0 14 14" width="15" height="15" fill="none">
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M7 4v3.2M7 9.4v.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          }
          value={stats?.past_deadline ?? "—"}
          label="Past deadline"
          hint={
            stats?.past_deadline
              ? `oldest ${stats.oldest_overdue_days} days over`
              : "nothing overdue"
          }
        />
        <StatTile
          icon={
            <svg viewBox="0 0 14 14" width="15" height="15" fill="none">
              <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M1.5 5.5h11M4.5 1v2M9.5 1v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          }
          value={stats?.due_soon ?? "—"}
          label="Due in 30 days"
          hint={
            stats?.next_due
              ? `next: ${stats.next_due.company_name ?? "—"} · ${stats.next_due.date}`
              : "nothing due"
          }
        />
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid #ECEEF8",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div className="tabs" style={{ marginBottom: 0 }}>
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={`tab ${filter === f.key ? "act" : ""}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div style={{ position: "relative", width: 240 }}>
            <input
              className="inp"
              placeholder="Search company"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 30 }}
            />
            <svg
              viewBox="0 0 13 13"
              width="13"
              height="13"
              fill="none"
              style={{ position: "absolute", left: 11, top: 12, color: "#9BA3C4" }}
            >
              <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8.5 8.5l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {loading ? (
          <Spinner />
        ) : error ? (
          <div style={{ padding: 32, textAlign: "center", fontSize: 12, color: "#5A6080" }}>
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1D2E" }}>
              {companies.length > 0
                ? "No companies match"
                : filter === "mine"
                  ? "You haven't added any companies"
                  : "No companies yet"}
            </div>
            <div style={{ fontSize: 12, color: "#9BA3C4", marginTop: 4 }}>
              {companies.length > 0
                ? "Try a different search."
                : filter === "mine"
                  ? "Add one, or switch to All to see every client."
                  : "Add your first company to get started."}
            </div>
          </div>
        ) : (
          <table className="utable">
            <thead>
              <tr>
                <th style={th}>Company</th>
                <th style={th}>Reporting cycles</th>
                <th style={{ ...th, width: 120 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className="urow"
                  style={{
                    cursor: "pointer",
                    ...(pinned.includes(c.id) ? { background: "#F7F7FF" } : {}),
                  }}
                  onClick={() => open(c)}
                >
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span
                        className="av av-ring"
                        style={{
                          background: gradientFor(c.id),
                          width: 34,
                          height: 34,
                          fontSize: 11,
                          borderRadius: 10,
                        }}
                      >
                        {initialsOf(c.name ?? "")}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 12.5 }}>{c.name}</span>
                    </div>
                  </td>
                  <td style={td}>
                    {c.cycle_count > 0 ? (
                      <span
                        style={{
                          fontFamily: "'DM Mono', monospace",
                          fontSize: 12,
                          fontWeight: 700,
                          color: PRIMARY,
                        }}
                      >
                        {c.cycle_count}
                        <span style={{ color: "#9BA3C4", fontWeight: 400, marginLeft: 5 }}>
                          {c.cycle_count === 1 ? "cycle" : "cycles"}
                        </span>
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: "#C4C9DD" }}>Not started</span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    {/* Only companies Spark created have Spark-made logins.
                        The name must not contain "Companies": a test finds
                        the sidebar's Companies button by that word. */}
                    {c.created_by_spark && (
                      <button
                        type="button"
                        aria-label={`Logins for ${c.name}`}
                        title="Logins"
                        onClick={(e) => {
                          // The row click opens the company; this must not.
                          e.stopPropagation();
                          setLoginsFor({ id: c.id, name: c.name });
                        }}
                        className="text-[#C4C9DD] [.urow:hover_&]:text-[#4040C8] focus-visible:text-[#4040C8]"
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 4,
                          marginRight: 8,
                          verticalAlign: "middle",
                        }}
                      >
                        <KeyIcon />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={pinned.includes(c.id) ? "Unpin company" : "Pin company"}
                      title={pinned.includes(c.id) ? "Unpin" : "Pin to top"}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePin(c.id);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 4,
                        marginRight: 8,
                        verticalAlign: "middle",
                        color: pinned.includes(c.id) ? PRIMARY : "#C4C9DD",
                      }}
                    >
                      <svg
                        viewBox="0 0 16 16"
                        width="14"
                        height="14"
                        fill={pinned.includes(c.id) ? "currentColor" : "none"}
                      >
                        <path
                          d="M10 1.5l4.5 4.5-2 .8-2.4 2.4.3 3.3-1 1-2.7-2.7L3 14.5l-.5-.5 2.7-2.7L2.5 8.6l1-1 3.3.3 2.4-2.4z"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    <span className="uchev">
                      <svg viewBox="0 0 12 12" width="11" height="11" fill="none">
                        <path
                          d="M4.5 2.5L8 6l-3.5 3.5"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {adding && <AddCompanyModal onClose={() => setAdding(false)} onCreated={openNew} />}
      {loginsFor && (
        <CompanyLoginsDialog
          companyId={loginsFor.id}
          companyName={loginsFor.name}
          onClose={() => setLoginsFor(null)}
        />
      )}
    </div>
  );
}
