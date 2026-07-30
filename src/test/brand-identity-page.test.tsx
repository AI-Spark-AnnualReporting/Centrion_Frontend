// What's worth testing on the Brand Identity page is the SAVE PAYLOAD, because
// every way it can be wrong is silent:
//
// 1. brand_colors is a jsonb column that PATCH overwrites wholesale — there is
//    no server-side merge — and the backend discards the entire company value
//    when `primary` is missing. A partial payload therefore looks like a
//    successful save and quietly resets the company's brand.
// 2. Clearing a field means sending null, not "". An empty string passes the
//    backend validator and stores a value that reads as "set" forever after.
// 3. Only changed fields may be sent. Sending the logo on every save means a
//    ~1.4 MB request body for a two-character text edit.
// 4. A re-uploaded document must land in the textarea UNSAVED, so the user can
//    review it — the extract endpoint persists nothing itself.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const getMyCompany = vi.fn();
const getMyCompanyLogo = vi.fn();
const updateMyCompany = vi.fn();
const extractBrandLanguage = vi.fn();
const getColorPalettesGlobal = vi.fn();

// Mock the real export names — see onboarding-brand-step.test.tsx for why that
// matters. brand-identity-api-contract.test.tsx is the backstop.
vi.mock("@/lib/api", () => ({
  companies: {
    getMyCompany: () => getMyCompany(),
    getMyCompanyLogo: () => getMyCompanyLogo(),
    updateMyCompany: (body: unknown) => updateMyCompany(body),
  },
  auth: { extractBrandLanguage: (f: File) => extractBrandLanguage(f) },
  quarterlyReports: { getColorPalettesGlobal: () => getColorPalettesGlobal() },
}));

const { default: BrandIdentityPage } = await import("@/pages/BrandIdentityPage");

const PALETTES = [
  { key: "violet_cyan", name: "Violet & Cyan", primary: "#3C0866", secondary: "#5BC9E2" },
  { key: "navy_gold", name: "Navy & Gold", primary: "#0A1F44", secondary: "#C9A227" },
];

const LOGO_URI = "data:image/png;base64,iVBORw0KGgo=";

const SAVED_COLORS = { primary: "#0A1F44", secondary: "#C9A227", palette_key: "navy_gold" };

const pngFile = (name = "logo.png", size = 1024) =>
  new File([new Uint8Array(size)], name, { type: "image/png" });

async function setup(
  company: Record<string, unknown> = {},
  logo: string | null = LOGO_URI,
) {
  getMyCompany.mockResolvedValue({
    brand_identity: "Voice: confident, plain-spoken.",
    brand_colors: SAVED_COLORS,
    ...company,
  });
  getMyCompanyLogo.mockResolvedValue({ logo_base64: logo });
  getColorPalettesGlobal.mockResolvedValue({ color_palettes: PALETTES });
  updateMyCompany.mockResolvedValue({});

  render(<BrandIdentityPage />);
  // Wait past the loading spinner AND the palette fetch, so nothing asserts
  // against a half-mounted page.
  await screen.findByRole("button", { name: /navy & gold/i });
}

const textarea = () =>
  screen.getByPlaceholderText(/write your brand language here/i) as HTMLTextAreaElement;
const saveButton = () => screen.getByRole("button", { name: /save changes/i });
const fileInputs = () => document.querySelectorAll('input[type="file"]');

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Brand Identity page — what it shows", () => {
  it("renders the stored logo, guideline text and colors", async () => {
    await setup();

    expect((screen.getByAltText(/company logo/i) as HTMLImageElement).src).toBe(LOGO_URI);
    expect(textarea().value).toBe("Voice: confident, plain-spoken.");
    // The saved palette is the selected pill, not a default.
    expect(screen.getByRole("button", { name: /navy & gold/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("renders an empty state without crashing when nothing is set", async () => {
    await setup({ brand_identity: null, brand_colors: null }, null);

    expect(textarea().value).toBe("");
    expect(screen.queryByAltText(/company logo/i)).not.toBeInTheDocument();
    // The empty state is the drop target, and Save has nothing to do.
    expect(screen.getAllByText(/drag your logo here/i).length).toBeGreaterThan(0);
    expect(saveButton()).toBeDisabled();
  });

  it("shows the guideline character count against the cap", async () => {
    await setup();
    // Queried by class because `{n} / {max}` renders as separate text nodes.
    const count = document.querySelector(".ob-char-count");
    expect(count?.textContent).toBe("31 / 24,000");
    expect(count?.className).not.toContain("over");
  });
});

describe("Brand Identity page — the save payload", () => {
  it("keeps Save disabled until something actually changes", async () => {
    await setup();
    expect(saveButton()).toBeDisabled();

    fireEvent.change(textarea(), { target: { value: "Voice: warm." } });
    expect(saveButton()).toBeEnabled();
  });

  it("sends ONLY the changed field", async () => {
    await setup();
    fireEvent.change(textarea(), { target: { value: "Voice: warm." } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(updateMyCompany).toHaveBeenCalled());
    // No logo, no colors — a text edit must not ship 1.4 MB of base64.
    expect(updateMyCompany).toHaveBeenCalledWith({ brand_identity: "Voice: warm." });
  });

  it("sends the COMPLETE brand_colors object, never a partial", async () => {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: /violet & cyan/i }));
    fireEvent.click(saveButton());

    await waitFor(() => expect(updateMyCompany).toHaveBeenCalled());
    // PATCH overwrites the whole jsonb column with no merge, and the backend
    // throws the value away entirely if primary is missing.
    expect(updateMyCompany).toHaveBeenCalledWith({
      brand_colors: { primary: "#3C0866", secondary: "#5BC9E2", palette_key: "violet_cyan" },
    });
  });

  it("sends null — not an empty string — when the guideline is cleared", async () => {
    await setup();
    fireEvent.change(textarea(), { target: { value: "   " } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(updateMyCompany).toHaveBeenCalled());
    expect(updateMyCompany).toHaveBeenCalledWith({ brand_identity: null });
  });

  it("sends null when the logo is removed", async () => {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: /remove logo/i }));
    fireEvent.click(saveButton());

    await waitFor(() => expect(updateMyCompany).toHaveBeenCalled());
    expect(updateMyCompany).toHaveBeenCalledWith({ logo_base64: null });
  });

  it("re-baselines after a save, so Save goes back to disabled", async () => {
    await setup();
    fireEvent.change(textarea(), { target: { value: "Voice: warm." } });
    fireEvent.click(saveButton());

    await screen.findByText(/updated successfully/i);
    expect(saveButton()).toBeDisabled();
  });

  it("surfaces a failed save and leaves the edit in place", async () => {
    await setup();
    updateMyCompany.mockRejectedValue(new Error("Nope."));

    fireEvent.change(textarea(), { target: { value: "Voice: warm." } });
    fireEvent.click(saveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Nope.");
    expect(textarea().value).toBe("Voice: warm.");
    expect(saveButton()).toBeEnabled();   // still dirty — the user can retry
  });
});

describe("Brand Identity page — uploads", () => {
  it("puts a re-uploaded document's text in the textarea WITHOUT saving it", async () => {
    await setup();
    extractBrandLanguage.mockResolvedValue({ text: "Tone: direct.", chars: 13 });

    fireEvent.change(fileInputs()[1], {
      target: { files: [new File([new Uint8Array(32)], "voice.pdf", { type: "application/pdf" })] },
    });

    await waitFor(() => expect(textarea().value).toBe("Tone: direct."));
    // Reviewable, not committed — walking away must cost nothing.
    expect(updateMyCompany).not.toHaveBeenCalled();
    expect(saveButton()).toBeEnabled();
  });

  it("rejects a non-PDF/DOCX guideline without calling the extractor", async () => {
    await setup();

    fireEvent.change(fileInputs()[1], { target: { files: [pngFile("brand.png")] } });

    expect(screen.getByText(/isn.t supported. Use a PDF or DOCX/i)).toBeInTheDocument();
    expect(extractBrandLanguage).not.toHaveBeenCalled();
    expect(textarea().value).toBe("Voice: confident, plain-spoken.");
  });

  it("leaves the existing logo alone when a rejected file is picked", async () => {
    await setup();

    // 2 MB — over the 1 MB cap the backend enforces on the decoded bytes.
    fireEvent.change(fileInputs()[0], {
      target: { files: [pngFile("big.png", 2 * 1024 * 1024)] },
    });

    expect(screen.getByText(/the limit is 1 MB/i)).toBeInTheDocument();
    expect((screen.getByAltText(/company logo/i) as HTMLImageElement).src).toBe(LOGO_URI);
    expect(saveButton()).toBeDisabled();   // nothing changed, so nothing to save
  });

  it("blocks Save while the guideline is over the character cap", async () => {
    await setup();

    fireEvent.change(textarea(), { target: { value: "x".repeat(24001) } });

    expect(saveButton()).toBeDisabled();
    expect(screen.getByText(/1 characters over the limit/i)).toBeInTheDocument();
  });
});
