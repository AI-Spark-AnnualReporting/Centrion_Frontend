// The voice rules are the ONLY part of the uploaded brand guideline the report
// writers read, so this card is the user's one chance to see what we understood
// before a report is written in it. What's worth testing is the save payload and
// the two states that are silent when wrong:
//
// 1. brand_voice must be sent ONLY when the user actually edited the rules. The
//    server treats its presence as "hand-corrected" and SKIPS the re-extraction a
//    new guideline triggers — so sending it unchanged alongside a new document
//    would suppress the very extraction that document was uploaded for.
// 2. While extraction is running the card must say so. Rendering the previous
//    voice with no indication reads as "your new guideline changed nothing".
// 3. A voice that came back FROM the server must not light up the Save bar.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const getMyCompany = vi.fn();
const getMyCompanyLogo = vi.fn();
const updateMyCompany = vi.fn();
const extractBrandLanguage = vi.fn();
const detectLogoColors = vi.fn();
const getCoverTemplatesGlobal = vi.fn(async () => ({ cover_templates: [] }));
const getColorPalettesGlobal = vi.fn();

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { role: "admin" } }),
}));

vi.mock("@/lib/api", () => ({
  companies: {
    getMyCompany: () => getMyCompany(),
    getMyCompanyLogo: () => getMyCompanyLogo(),
    updateMyCompany: (body: unknown) => updateMyCompany(body),
  },
  auth: {
    extractBrandLanguage: (f: File) => extractBrandLanguage(f),
    detectLogoColors: (uri: string) => detectLogoColors(uri),
  },
  quarterlyReports: {
    getColorPalettesGlobal: () => getColorPalettesGlobal(),
    getCoverTemplatesGlobal: () => getCoverTemplatesGlobal(),
  },
  ApiError: class ApiError extends Error {},
}));

import BrandIdentityPage from "@/pages/BrandIdentityPage";

const PALETTES = [
  { key: "violet_cyan", name: "Violet & Cyan", primary: "#3C0866", secondary: "#5BC9E2" },
  { key: "navy_gold", name: "Navy & Gold", primary: "#0A1F44", secondary: "#C9A227" },
];
const SAVED_COLORS = { primary: "#0A1F44", secondary: "#C9A227", palette_key: "navy_gold" };

const VOICE = {
  register: "Confident and plainspoken",
  person: "first-person 'we'",
  sentence_style: "short, active",
  tone_adjectives: ["bold", "human"],
  preferred_words: ["people"],
  banned_words: ["synergy"],
  do: ["Lead with the benefit"],
  dont: ["Never use jargon"],
};

async function setup(company: Record<string, unknown> = {}) {
  getMyCompany.mockResolvedValue({
    brand_identity: "Voice: confident, plain-spoken.",
    brand_colors: SAVED_COLORS,
    brand_voice: VOICE,
    brand_voice_status: "done",
    ...company,
  });
  getMyCompanyLogo.mockResolvedValue({ logo_base64: null });
  getColorPalettesGlobal.mockResolvedValue({ color_palettes: PALETTES });
  updateMyCompany.mockResolvedValue({});

  render(<BrandIdentityPage />);
  await screen.findByRole("button", { name: /navy & gold/i });
}

const saveButton = () => screen.getByRole("button", { name: /save changes/i });
const textarea = () =>
  screen.getByPlaceholderText(/write your brand language here/i) as HTMLTextAreaElement;

beforeEach(() => {
  vi.clearAllMocks();
  getCoverTemplatesGlobal.mockResolvedValue({ cover_templates: [] });
});

describe("Brand voice card — what it shows", () => {
  it("renders the rules the reports will actually be written in", async () => {
    await setup();
    expect(screen.getByText(/voice rules we extracted/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Confident and plainspoken")).toBeInTheDocument();
    expect(screen.getByText("bold")).toBeInTheDocument();
    expect(screen.getByText("synergy")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Lead with the benefit")).toBeInTheDocument();
  });

  it("says it is reading while extraction is still running", async () => {
    // Otherwise a fresh upload looks like it changed nothing.
    await setup({ brand_voice: null, brand_voice_status: "processing" });
    expect(screen.getByText(/reading your guideline/i)).toBeInTheDocument();
  });

  it("explains itself when the document had no writing rules in it", async () => {
    // The logo-and-colours-only brand book. Silence here would leave the user
    // believing their voice is in use when reports are in the default one.
    await setup({ brand_voice: null, brand_voice_status: "failed" });
    expect(screen.getByText(/couldn’t pull any writing rules/i)).toBeInTheDocument();
  });

  it("is hidden entirely for a company with no guideline", async () => {
    await setup({ brand_identity: "", brand_voice: null, brand_voice_status: null });
    expect(screen.queryByText(/voice rules we extracted/i)).not.toBeInTheDocument();
  });
});

describe("Brand voice card — the save payload", () => {
  it("does not send brand_voice when only the guideline text changed", async () => {
    // The load-bearing case: brand_voice in the same PATCH marks the voice
    // hand-corrected and skips re-extraction, so sending it unchanged here would
    // suppress the extraction the new text needs.
    await setup();
    fireEvent.change(textarea(), { target: { value: "A completely new guideline." } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(updateMyCompany).toHaveBeenCalled());
    const body = updateMyCompany.mock.calls[0][0];
    expect(body.brand_identity).toBe("A completely new guideline.");
    expect(body).not.toHaveProperty("brand_voice");
  });

  it("sends brand_voice when the user corrects a rule", async () => {
    await setup();
    fireEvent.change(screen.getByDisplayValue("Confident and plainspoken"), {
      target: { value: "Warm and direct" },
    });
    fireEvent.click(saveButton());

    await waitFor(() => expect(updateMyCompany).toHaveBeenCalled());
    const body = updateMyCompany.mock.calls[0][0];
    expect(body.brand_voice.register).toBe("Warm and direct");
    expect(body).not.toHaveProperty("brand_identity");
  });

  it("removing a banned word reaches the payload", async () => {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: /remove synergy/i }));
    fireEvent.click(saveButton());

    await waitFor(() => expect(updateMyCompany).toHaveBeenCalled());
    expect(updateMyCompany.mock.calls[0][0].brand_voice.banned_words).toEqual([]);
  });

  it("a second rule can be typed on a new line", async () => {
    // The rules are stored as an array. Splitting on every keystroke would drop
    // the newline as it is typed, so a second rule could never be entered.
    await setup();
    const box = screen.getByDisplayValue("Lead with the benefit");
    fireEvent.change(box, { target: { value: "Lead with the benefit\nSay it once" } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(updateMyCompany).toHaveBeenCalled());
    expect(updateMyCompany.mock.calls[0][0].brand_voice.do).toEqual([
      "Lead with the benefit",
      "Say it once",
    ]);
  });

  it("merely rendering the rules does not make the page dirty", async () => {
    // The card reads eight fields off the loaded row and feeds them into
    // controlled inputs. If any of them normalised on the way in (null -> "",
    // say), the page would mount dirty and offer to save a change nobody made.
    await setup();
    expect(saveButton()).toBeDisabled();
  });

  it("a voice arriving from the background extraction does not make it dirty either", async () => {
    // The poll writes the server's answer into state. Without re-baselining, the
    // Save bar would light up for a value that is already saved.
    await setup({ brand_voice: null, brand_voice_status: "processing" });
    // The next poll tick sees the finished extraction.
    getMyCompany.mockResolvedValue({
      brand_identity: "Voice: confident, plain-spoken.",
      brand_colors: SAVED_COLORS,
      brand_voice: VOICE,
      brand_voice_status: "done",
    });
    // Real timers: the poll interval is created inside an effect at mount, so
    // swapping in fake ones afterwards would never fire it, and installing them
    // beforehand stalls testing-library's own waiting.
    await screen.findByDisplayValue("Confident and plainspoken", {}, { timeout: 6000 });
    expect(saveButton()).toBeDisabled();
  }, 10000);
});
