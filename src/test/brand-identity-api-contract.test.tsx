// Renders the Brand Identity page against the REAL @/lib/api module —
// deliberately unmocked.
//
// Same reason onboarding-brand-api-contract.test.tsx exists: the rest of this
// page's suite mocks @/lib/api, and a mock is free to invent an export that
// production doesn't have. That already happened once on the Brand step — the
// mocked tests all passed while the live step white-screened on mount.
//
// This page calls FIVE api functions across three namespaces, so it has more
// surface to get wrong than the step did.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { auth, companies, quarterlyReports } from "@/lib/api";
import BrandIdentityPage from "@/pages/BrandIdentityPage";

// Unrelated to the real-api-module contract this file checks — the page now
// also reads useAuth() to decide editability, so it needs a provider (or a
// mock) to mount at all.
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { role: "admin" } }),
}));

describe("Brand Identity page against the real api module", () => {
  it("exposes every endpoint the page calls", () => {
    expect(typeof companies.getMyCompany).toBe("function");
    expect(typeof companies.getMyCompanyLogo).toBe("function");
    expect(typeof companies.updateMyCompany).toBe("function");
    expect(typeof auth.extractBrandLanguage).toBe("function");
    expect(typeof auth.detectLogoColors).toBe("function");
    expect(typeof quarterlyReports.getColorPalettesGlobal).toBe("function");
  });

  it("mounts and reaches a real load without throwing", async () => {
    // Only fetch is stubbed: the real api module still runs, so a bad module
    // reference still throws "is not a function". Letting the request actually
    // go out would hit api.ts's 401 redirect, which jsdom can't perform.
    const realFetch = global.fetch;
    global.fetch = vi.fn(() => Promise.reject(new Error("offline"))) as typeof fetch;

    render(<BrandIdentityPage />);

    // The load fails offline, which is the point: reaching the error banner
    // proves getMyCompany/getMyCompanyLogo were really called and rejected,
    // rather than throwing before a request ever went out.
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalled();

    global.fetch = realFetch;
  });

  it("reaches the real extract call when a document is picked", async () => {
    // Mounting doesn't touch auth.extractBrandLanguage — only picking a file
    // does — so a wrong module reference here would survive every other test.
    const realFetch = global.fetch;
    // The page needs a successful load before the upload control renders, so
    // resolve the two GETs and fail only the extract POST.
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/companies/me/logo")) {
        return Promise.resolve(
          new Response(JSON.stringify({ logo_base64: null }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      if (url.includes("/companies/me")) {
        return Promise.resolve(
          new Response(JSON.stringify({ brand_identity: null, brand_colors: null }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.reject(new Error("offline"));
    }) as typeof fetch;

    render(<BrandIdentityPage />);
    await screen.findByPlaceholderText(/write your brand language here/i);

    const inputs = document.querySelectorAll('input[type="file"]');
    const doc = new File([new Uint8Array(32)], "voice.pdf", { type: "application/pdf" });
    fireEvent.change(inputs[1], { target: { files: [doc] } });

    await waitFor(() =>
      expect(screen.getByText(/couldn.t read that document/i)).toBeInTheDocument(),
    );

    global.fetch = realFetch;
  });
});
