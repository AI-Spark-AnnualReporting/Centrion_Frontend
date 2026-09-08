// The company-profile document is read by a single LLM call, so exactly one
// file may be submitted. Both upload points already held a single File and both
// backends take one `UploadFile`, but a MULTI-FILE DROP was silently reduced to
// files[0] — the user saw one name appear with no hint the rest were discarded.
// These pin the explicit rejection at both places.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CompanyIntelStep from "@/pages/onboarding/CompanyIntelStep";
import StepTwoForm from "@/components/registration/StepTwoForm";
import BrandUploadBox from "@/components/brand/BrandUploadBox";

const pdf = (name: string) =>
  new File(["x"], name, { type: "application/pdf" });

// jsdom's drop event needs a dataTransfer with a real FileList-ish shape.
function dropFiles(zone: Element, files: File[]) {
  fireEvent.drop(zone, {
    dataTransfer: { files, items: files.map((f) => ({ kind: "file", getAsFile: () => f })) },
  });
}

// The two flows word it for what they take: a profile "document" vs a brand "file".
const TOO_MANY = /one document at a time/i;
const TOO_MANY_FILES = /one file at a time/i;

describe("onboarding Company Intel step", () => {
  const renderStep = () =>
    render(<CompanyIntelStep onAnalyse={vi.fn()} onSkipManual={vi.fn()} />);

  it("rejects a multi-file drop instead of silently keeping the first", () => {
    renderStep();
    const zone = document.querySelector(".ob-drop")!;

    dropFiles(zone, [pdf("a.pdf"), pdf("b.pdf")]);

    expect(screen.getByRole("alert")).toHaveTextContent(TOO_MANY);
    // Neither file is staged — we can't know which one was meant.
    expect(screen.queryByText("a.pdf")).toBeNull();
    expect(screen.queryByText("b.pdf")).toBeNull();
  });

  it("accepts a single dropped file", () => {
    renderStep();
    const zone = document.querySelector(".ob-drop")!;

    dropFiles(zone, [pdf("a.pdf")]);

    expect(screen.getByText("a.pdf")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not hand a rejected drop to the extractor", () => {
    const onAnalyse = vi.fn();
    render(<CompanyIntelStep onAnalyse={onAnalyse} onSkipManual={vi.fn()} />);
    dropFiles(document.querySelector(".ob-drop")!, [pdf("a.pdf"), pdf("b.pdf")]);

    fireEvent.click(screen.getByRole("button", { name: /analyse document/i }));

    // The LLM call is the whole cost — it must not fire on a rejected drop.
    expect(onAnalyse).not.toHaveBeenCalled();
  });
});

// BrandUploadBox is shared by BOTH brand fields (logo + guideline) and by BOTH
// screens that show them (onboarding Brand step, Brand Identity page), so
// testing the component covers all four call sites.
describe("brand upload box", () => {
  const renderBox = (onPick = vi.fn()) => {
    render(
      <BrandUploadBox
        icon="🖼️"
        prompt="Drag your logo here"
        hint="PNG or JPG · up to 1 MB"
        accept=".png,.jpg"
        removeLabel="Remove logo"
        onPick={onPick}
      />,
    );
    return onPick;
  };

  it("rejects a multi-file drop without picking anything", () => {
    const onPick = renderBox();
    dropFiles(document.querySelector(".ob-drop")!, [pdf("a.png"), pdf("b.png")]);

    expect(screen.getByText(TOO_MANY_FILES)).toBeInTheDocument();
    expect(onPick).not.toHaveBeenCalled();
  });

  it("accepts a single dropped file and clears the message", () => {
    const onPick = renderBox();
    const zone = document.querySelector(".ob-drop")!;

    dropFiles(zone, [pdf("a.png"), pdf("b.png")]);
    expect(screen.getByText(TOO_MANY_FILES)).toBeInTheDocument();

    const only = pdf("only.png");
    dropFiles(zone, [only]);
    expect(onPick).toHaveBeenCalledWith(only);
    expect(screen.queryByText(TOO_MANY_FILES)).toBeNull();
  });

  it("still shows the parent's own error", () => {
    render(
      <BrandUploadBox
        icon="🖼️"
        prompt="Drag your logo here"
        hint="PNG or JPG · up to 1 MB"
        accept=".png,.jpg"
        removeLabel="Remove logo"
        error="That image is too large."
        onPick={vi.fn()}
      />,
    );
    expect(screen.getByText("That image is too large.")).toBeInTheDocument();
  });
});

describe("signup step two", () => {
  it("rejects a multi-file drop", () => {
    render(
      <StepTwoForm
        initialValues={{ companyName: "Acme", jurisdiction: "KSA", website: "", file: null }}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
        error=""
        loading={false}
      />,
    );
    const zone = document.querySelector(".upload-z")!;

    dropFiles(zone, [pdf("a.pdf"), pdf("b.pdf")]);
    expect(screen.getByText(TOO_MANY)).toBeInTheDocument();

    // A single file still works.
    dropFiles(zone, [pdf("only.pdf")]);
    expect(screen.queryByText(TOO_MANY)).toBeNull();
    expect(screen.getByText("only.pdf")).toBeInTheDocument();
  });
});
