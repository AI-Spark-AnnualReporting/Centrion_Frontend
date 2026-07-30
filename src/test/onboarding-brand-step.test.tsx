// The Brand step's silent-failure modes are what's worth testing.
//
// 1. The logo is read to base64 in the browser and stored inline on the company
//    row. A file that fails validation must not partially overwrite a good one,
//    and the data URI handed upward must be the real thing — it goes straight
//    into the report cover with no server-side re-encoding to catch mistakes.
// 2. The guideline document's value is the EXTRACTED TEXT, not the file. A
//    document that fails extraction must surface an error and leave any
//    already-accepted document alone, or the company silently onboards with an
//    empty brand voice.
// 3. Nothing on this step is required, so Continue must never be blocked.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const getColorPalettesGlobal = vi.fn();
const extractBrandLanguage = vi.fn();
const detectLogoColors = vi.fn();

// Mock the real export names. Getting this wrong is not a hypothetical: an
// earlier version stubbed a `reports` object that doesn't own the palette
// function, so the suite passed while the live step white-screened. The contract
// test in onboarding-brand-api-contract.test.tsx is the backstop for that.
vi.mock("@/lib/api", () => ({
  quarterlyReports: { getColorPalettesGlobal: () => getColorPalettesGlobal() },
  auth: {
    extractBrandLanguage: (f: File) => extractBrandLanguage(f),
    detectLogoColors: (uri: string) => detectLogoColors(uri),
  },
}));

const { default: BrandStep } = await import("@/pages/onboarding/BrandStep");

const PALETTES = [
  { key: "violet_cyan", name: "Violet & Cyan", primary: "#3C0866", secondary: "#5BC9E2" },
  { key: "navy_gold", name: "Navy & Gold", primary: "#0A1F44", secondary: "#C9A227" },
];

const DEFAULT_BRAND = { primary: "#3C0866", secondary: "#5BC9E2", palette_key: "violet_cyan" };

// Awaits the palette fetch settling, so no test asserts against a
// half-mounted component (and React doesn't warn about an unwrapped update).
async function setup(overrides: Partial<Parameters<typeof BrandStep>[0]> = {}) {
  const props = {
    logo: null,
    onLogoChange: vi.fn(),
    guideline: null,
    onGuidelineChange: vi.fn(),
    brandColors: DEFAULT_BRAND,
    onBrandColorsChange: vi.fn(),
    onBack: vi.fn(),
    onContinue: vi.fn(),
    ...overrides,
  };
  render(<BrandStep {...props} />);
  await screen.findByRole("button", { name: /violet & cyan/i });
  return props;
}

const pngFile = (name = "logo.png", size = 1024) =>
  new File([new Uint8Array(size)], name, { type: "image/png" });

const docFile = (name = "guideline.pdf") =>
  new File([new Uint8Array(512)], name, { type: "application/pdf" });

const pickedLogo = (name = "acme-mark.png") => ({
  name,
  size: 2048,
  dataUri: "data:image/png;base64,iVBORw0KGgo=",
});

const pickedGuideline = (name = "brand-voice.pdf") => ({
  name,
  text: "Voice: confident, plain-spoken.",
  chars: 31,
});

// The two upload boxes share one component, so target them by their file input.
const fileInputs = () =>
  Array.from(document.querySelectorAll('input[type="file"]')) as HTMLInputElement[];
const logoInput = () => fileInputs()[0];
const docInput = () => fileInputs()[1];

beforeEach(() => {
  vi.clearAllMocks();
  getColorPalettesGlobal.mockResolvedValue({ color_palettes: PALETTES });
  extractBrandLanguage.mockResolvedValue({ text: "Voice: plain-spoken.", chars: 20 });
  detectLogoColors.mockResolvedValue({
    primary: "#0A5F55", secondary: "#E4A11B",
    palette_key: "custom", source: "vision",
    candidates: ["#0A5F55", "#E4A11B"],
  });
});

describe("nothing on this step is required", () => {
  it("continues with everything empty", async () => {
    const props = await setup();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(props.onContinue).toHaveBeenCalledOnce();
  });

  it("continues after a failed guideline extraction", async () => {
    extractBrandLanguage.mockRejectedValue(new Error("nope"));
    const props = await setup();
    fireEvent.change(docInput(), { target: { files: [docFile()] } });
    await screen.findByText(/couldn’t read that document/i);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(props.onContinue).toHaveBeenCalledOnce();
  });

  it("goes back without validating anything", async () => {
    const props = await setup();
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(props.onBack).toHaveBeenCalledOnce();
  });
});

describe("brand language guideline", () => {
  it("sends the picked document for extraction and stores the text", async () => {
    const props = await setup();
    extractBrandLanguage.mockResolvedValue({ text: "Tone: precise.", chars: 14 });
    fireEvent.change(docInput(), { target: { files: [docFile("brand-voice.pdf")] } });
    await waitFor(() => expect(props.onGuidelineChange).toHaveBeenCalled());
    expect(extractBrandLanguage).toHaveBeenCalledWith(expect.any(File));
    // What's stored is the extracted TEXT — that's what lands in brand_identity.
    expect(props.onGuidelineChange).toHaveBeenCalledWith({
      name: "brand-voice.pdf", text: "Tone: precise.", chars: 14,
    });
  });

  it("accepts a DOCX", async () => {
    const props = await setup();
    const docx = new File([new Uint8Array(64)], "voice.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    fireEvent.change(docInput(), { target: { files: [docx] } });
    await waitFor(() => expect(props.onGuidelineChange).toHaveBeenCalled());
  });

  it("rejects a non PDF/DOCX before calling the backend", async () => {
    const props = await setup();
    const png = pngFile("chart.png");
    fireEvent.change(docInput(), { target: { files: [png] } });
    expect(extractBrandLanguage).not.toHaveBeenCalled();
    expect(props.onGuidelineChange).not.toHaveBeenCalled();
    expect(screen.getByText(/use a pdf or docx/i)).toBeInTheDocument();
  });

  it("surfaces the backend's message for an unreadable document", async () => {
    // A scanned PDF: the server explains why, and that reason must reach the user.
    const err = Object.assign(new Error("bad"), {
      body: { detail: "We couldn't read any text from that document." },
    });
    extractBrandLanguage.mockRejectedValue(err);
    const props = await setup();
    fireEvent.change(docInput(), { target: { files: [docFile("scan.pdf")] } });
    expect(await screen.findByText(/couldn't read any text/i)).toBeInTheDocument();
    expect(props.onGuidelineChange).not.toHaveBeenCalled();
  });

  it("a failed extraction leaves an already-accepted document alone", async () => {
    extractBrandLanguage.mockRejectedValue(new Error("nope"));
    const props = await setup({ guideline: pickedGuideline("good.pdf") });
    fireEvent.change(docInput(), { target: { files: [docFile("bad.pdf")] } });
    await screen.findByText(/couldn’t read that document/i);
    expect(props.onGuidelineChange).not.toHaveBeenCalled();
    expect(screen.getByText("good.pdf")).toBeInTheDocument();
  });

  it("shows the character count once read", async () => {
    await setup({ guideline: { name: "voice.pdf", text: "x", chars: 12403 } });
    expect(screen.getByText(/12,403 characters read/i)).toBeInTheDocument();
  });

  it("can be removed", async () => {
    const props = await setup({ guideline: pickedGuideline() });
    fireEvent.click(screen.getByRole("button", { name: /remove document/i }));
    expect(props.onGuidelineChange).toHaveBeenCalledWith(null);
  });

  it("is labelled Brand language guideline and marked optional", async () => {
    await setup();
    expect(screen.getByText("Brand language guideline")).toBeInTheDocument();
    expect(screen.queryByText(/brand identity/i)).not.toBeInTheDocument();
  });
});

describe("logo", () => {
  it("reads a valid PNG into a base64 data URI", async () => {
    const props = await setup();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pngFile()] } });
    // FileReader is async — the data URI is what gets stored, so wait for it.
    await waitFor(() => expect(props.onLogoChange).toHaveBeenCalled());
    const picked = props.onLogoChange.mock.calls[0][0];
    expect(picked.name).toBe("logo.png");
    expect(picked.dataUri).toMatch(/^data:image\/png;base64,/);
  });

  it("accepts a JPEG", async () => {
    const props = await setup();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const jpeg = new File([new Uint8Array(512)], "mark.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [jpeg] } });
    await waitFor(() => expect(props.onLogoChange).toHaveBeenCalled());
    expect(props.onLogoChange.mock.calls[0][0].dataUri).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("rejects a non-image without calling up", async () => {
    const props = await setup();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const txt = new File(["hi"], "notes.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [txt] } });
    expect(props.onLogoChange).not.toHaveBeenCalled();
    expect(screen.getByText(/isn’t supported/i)).toBeInTheDocument();
  });

  it("rejects SVG — the backend only stores PNG and JPEG", async () => {
    const props = await setup();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const svg = new File(["<svg/>"], "mark.svg", { type: "image/svg+xml" });
    fireEvent.change(input, { target: { files: [svg] } });
    expect(props.onLogoChange).not.toHaveBeenCalled();
  });

  it("rejects an image over 1 MB", async () => {
    const props = await setup();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pngFile("big.png", 2 * 1024 * 1024)] } });
    expect(props.onLogoChange).not.toHaveBeenCalled();
    expect(screen.getByText(/the limit is 1 MB/i)).toBeInTheDocument();
  });

  it("shows the filename and a remove control once picked", async () => {
    const props = await setup({ logo: pickedLogo() });
    expect(screen.getByText("acme-mark.png")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /remove logo/i }));
    expect(props.onLogoChange).toHaveBeenCalledWith(null);
  });

  it("previews the stored data URI, not a blob URL", async () => {
    await setup({ logo: pickedLogo() });
    const img = screen.getByAltText(/acme-mark\.png preview/i) as HTMLImageElement;
    expect(img.src).toMatch(/^data:image\/png;base64,/);
  });

  it("a rejected file does not clear an already-picked logo", async () => {
    const props = await setup({ logo: pickedLogo("good.png") });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pngFile("big.png", 2 * 1024 * 1024)] } });
    expect(props.onLogoChange).not.toHaveBeenCalled();
    expect(screen.getByText("good.png")).toBeInTheDocument();
  });

  it("does not block Continue — the logo is optional", async () => {
    const props = await setup({ brandIdentity: "A modern energy company with a long history." });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(props.onContinue).toHaveBeenCalledOnce();
  });
});

describe("brand colors", () => {
  it("loads the same presets the report builder uses", async () => {
    await setup();
    expect(await screen.findByRole("button", { name: /navy & gold/i })).toBeInTheDocument();
  });

  it("falls back to local presets when the palette call fails", async () => {
    getColorPalettesGlobal.mockRejectedValue(new Error("offline"));
    await setup();
    // Never blocks onboarding: the built-in three are still offered.
    expect(await screen.findByRole("button", { name: /violet & cyan/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /green & slate/i })).toBeInTheDocument();
  });

  it("picking a preset reports the full palette upward", async () => {
    const props = await setup();
    fireEvent.click(await screen.findByRole("button", { name: /navy & gold/i }));
    expect(props.onBrandColorsChange).toHaveBeenCalledWith({
      primary: "#0A1F44",
      secondary: "#C9A227",
      palette_key: "navy_gold",
    });
  });

  it("custom hex marks the palette as custom", async () => {
    const props = await setup();
    fireEvent.click(screen.getByRole("button", { name: /^custom$/i }));
    const hex = await screen.findByLabelText(/primary hex value/i);
    fireEvent.change(hex, { target: { value: "#123456" } });
    expect(props.onBrandColorsChange).toHaveBeenCalledWith(
      expect.objectContaining({ primary: "#123456", palette_key: "custom" }),
    );
  });

  it("warns when the primary is too pale to read as an accent", async () => {
    await setup({ brandColors: { primary: "#FAFAFA", secondary: "#C9A227", palette_key: "custom" } });
    await waitFor(() =>
      expect(screen.getByText(/hard to read as an accent/i)).toBeInTheDocument(),
    );
  });

  it("tells the user where these colors get used", async () => {
    await setup();
    expect(screen.getByText(/headings and cover pages/i)).toBeInTheDocument();
  });
});

// Auto-filling the colors from the logo. The rule that matters: detection is a
// convenience bolted onto a picker that already works, so it must never damage
// the upload or a choice the user made themselves.
describe("brand colors detected from the logo", () => {
  const pickLogo = () =>
    fireEvent.change(document.querySelectorAll('input[type="file"]')[0], {
      target: { files: [pngFile()] },
    });

  it("applies the detected colors after a logo is picked", async () => {
    const props = await setup();
    pickLogo();

    await waitFor(() =>
      expect(props.onBrandColorsChange).toHaveBeenCalledWith({
        primary: "#0A5F55", secondary: "#E4A11B", palette_key: "custom",
      }),
    );
    // Sent the base64 data URI, which is what the endpoint validates and what
    // ends up in companies.logo_base64 — not the File.
    expect(detectLogoColors).toHaveBeenCalledTimes(1);
    expect(detectLogoColors.mock.calls[0][0]).toMatch(/^data:image\/png;base64,/);
  });

  it("shows progress, then the undo affordance", async () => {
    await setup();
    pickLogo();

    expect(await screen.findByText(/reading your logo.s colors/i)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /undo/i })).toBeInTheDocument();
  });

  it("restores the previous colors on undo", async () => {
    const props = await setup();
    pickLogo();

    fireEvent.click(await screen.findByRole("button", { name: /undo/i }));
    expect(props.onBrandColorsChange).toHaveBeenLastCalledWith(DEFAULT_BRAND);
    expect(screen.queryByRole("button", { name: /undo/i })).not.toBeInTheDocument();
  });

  it("changes nothing when the logo carries no color", async () => {
    detectLogoColors.mockResolvedValue({
      primary: null, secondary: null, palette_key: "custom",
      source: "none", candidates: [],
    });
    const props = await setup();
    pickLogo();

    await waitFor(() => expect(detectLogoColors).toHaveBeenCalled());
    expect(props.onBrandColorsChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /undo/i })).not.toBeInTheDocument();
  });

  it("a failed detection never becomes a logo error", async () => {
    // The logo itself was read fine. Reporting a detection failure as an image
    // problem would be a lie, and it's what happens if the call isn't isolated.
    detectLogoColors.mockRejectedValue(new Error("model exploded"));
    const props = await setup();
    pickLogo();

    // Both waits are POSITIVE conditions. Waiting for the progress line to be
    // ABSENT would pass instantly — before the logo was even read — and leave
    // pending work to settle inside the next test.
    await waitFor(() => expect(props.onLogoChange).toHaveBeenCalled());
    await waitFor(() => expect(detectLogoColors).toHaveBeenCalled());

    expect(screen.queryByText(/couldn.t read that image/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/model exploded/i)).not.toBeInTheDocument();
    expect(props.onBrandColorsChange).not.toHaveBeenCalled();
  });

  it("is not attempted for a logo that failed validation", async () => {
    await setup();
    fireEvent.change(document.querySelectorAll('input[type="file"]')[0], {
      target: { files: [pngFile("big.png", 2 * 1024 * 1024)] },
    });
    expect(detectLogoColors).not.toHaveBeenCalled();
  });

  it("stops crediting the logo once the user picks a color by hand", async () => {
    await setup();
    pickLogo();
    await screen.findByRole("button", { name: /undo/i });

    fireEvent.click(screen.getByRole("button", { name: /navy & gold/i }));
    expect(screen.queryByRole("button", { name: /undo/i })).not.toBeInTheDocument();
  });

  it("a slow detection cannot overwrite a color the user just chose", async () => {
    // Detection resolves only after the manual pick, and must be discarded.
    let release: (v: unknown) => void = () => {};
    detectLogoColors.mockReturnValue(new Promise((r) => { release = r; }));

    const props = await setup();
    pickLogo();
    // Reading the logo to base64 is itself async, so wait until detection is
    // genuinely in flight — otherwise the click lands before it even starts and
    // the test proves nothing.
    await screen.findByText(/reading your logo.s colors/i);

    fireEvent.click(screen.getByRole("button", { name: /navy & gold/i }));
    const callsBefore = props.onBrandColorsChange.mock.calls.length;

    release({ primary: "#0A5F55", secondary: "#E4A11B", palette_key: "custom",
              source: "vision", candidates: [] });
    await waitFor(() =>
      expect(screen.queryByText(/reading your logo.s colors/i)).not.toBeInTheDocument(),
    );
    expect(props.onBrandColorsChange.mock.calls.length).toBe(callsBefore);
  });
});
