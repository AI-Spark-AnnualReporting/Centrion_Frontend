// Renders the Brand step against the REAL @/lib/api module — deliberately
// unmocked.
//
// The rest of the Brand-step suite mocks @/lib/api, and a mock is free to
// invent an export that production doesn't have. That is exactly what happened:
// the step called `reports.getColorPalettesGlobal()` while the function
// actually lives on `quarterlyReports`, so every mocked test passed and the
// live step crashed to a white screen the moment it mounted.
//
// Anything that exercises the component for real would have caught it, so keep
// tests that do. Note that mounting alone is NOT enough for the document
// upload: that call only fires on interaction, so it needs its own test that
// actually picks a file.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { auth, quarterlyReports } from "@/lib/api";
import BrandStep from "@/pages/onboarding/BrandStep";

const noop = () => {};

describe("Brand step against the real api module", () => {
  it("exposes the palette endpoint the step calls", () => {
    expect(typeof quarterlyReports.getColorPalettesGlobal).toBe("function");
  });

  it("exposes the guideline-extraction endpoint the step calls", () => {
    expect(typeof auth.extractBrandLanguage).toBe("function");
  });

  it("mounts without throwing", async () => {
    render(
      <BrandStep
        logo={null}
        onLogoChange={noop}
        guideline={null}
        onGuidelineChange={noop}
        brandColors={{ primary: "#3C0866", secondary: "#5BC9E2", palette_key: "violet_cyan" }}
        onBrandColorsChange={noop}
        onBack={noop}
        onContinue={noop}
      />,
    );
    // Renders, and the built-in palettes show even though the fetch can't
    // succeed in jsdom — the step must never depend on that call landing.
    expect(await screen.findByText("Your Brand")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /navy & gold/i })).toBeInTheDocument();
  });

  it("reaches the real extract call when a document is picked", async () => {
    // Mounting doesn't touch auth.extractBrandLanguage — only picking a file
    // does — so a wrong module reference here would survive every other test.
    //
    // Only fetch is stubbed: the real api module still runs, so a bad module
    // reference still throws "is not a function". Letting the request actually
    // go out would hit api.ts's 401 redirect, which jsdom can't perform.
    const realFetch = global.fetch;
    global.fetch = vi.fn(() => Promise.reject(new Error("offline"))) as typeof fetch;

    render(
      <BrandStep
        logo={null}
        onLogoChange={noop}
        guideline={null}
        onGuidelineChange={noop}
        brandColors={{ primary: "#3C0866", secondary: "#5BC9E2", palette_key: "violet_cyan" }}
        onBrandColorsChange={noop}
        onBack={noop}
        onContinue={noop}
      />,
    );
    const inputs = document.querySelectorAll('input[type="file"]');
    const doc = new File([new Uint8Array(32)], "voice.pdf", { type: "application/pdf" });
    fireEvent.change(inputs[1], { target: { files: [doc] } });

    // There's no server in jsdom, so the request fails — but reaching the
    // friendly error proves the call was made and rejected, rather than
    // throwing "is not a function" before a request ever went out.
    await waitFor(() =>
      expect(screen.getByText(/couldn.t read that document/i)).toBeInTheDocument(),
    );
    expect(global.fetch).toHaveBeenCalled();   // a request really was attempted
    global.fetch = realFetch;
  });
});
