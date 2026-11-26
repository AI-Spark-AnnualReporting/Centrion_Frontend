// copyTextToClipboard: clipboard API first, then the execCommand fallback
// that works on plain http (on-premises servers).

import { describe, it, expect, afterEach, vi } from "vitest";

import { copyTextToClipboard } from "@/lib/copyText";

const originalClipboard = navigator.clipboard;
const originalExecCommand = document.execCommand;

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", { value, configurable: true });
}

function setExecCommand(value: unknown) {
  Object.defineProperty(document, "execCommand", { value, configurable: true, writable: true });
}

afterEach(() => {
  setClipboard(originalClipboard);
  setExecCommand(originalExecCommand);
});

describe("copyTextToClipboard", () => {
  it("uses the clipboard API when it works", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const execCommand = vi.fn().mockReturnValue(true);
    setClipboard({ writeText });
    setExecCommand(execCommand);

    expect(await copyTextToClipboard("server-123")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("server-123");
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("falls back to execCommand when there is no clipboard API (plain http)", async () => {
    setClipboard(undefined);
    let copiedValue = "";
    setExecCommand(
      vi.fn(() => {
        copiedValue = (document.activeElement as HTMLTextAreaElement).value;
        return true;
      }),
    );

    expect(await copyTextToClipboard("server-123")).toBe(true);
    expect(copiedValue).toBe("server-123");
    expect(document.querySelectorAll("textarea")).toHaveLength(0); // cleaned up
  });

  it("falls back to execCommand when the clipboard API rejects", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    setExecCommand(vi.fn().mockReturnValue(true));

    expect(await copyTextToClipboard("server-123")).toBe(true);
  });

  it("returns false when both methods fail", async () => {
    setClipboard(undefined);
    setExecCommand(vi.fn().mockReturnValue(false));

    expect(await copyTextToClipboard("server-123")).toBe(false);
  });

  it("puts focus back on the button after the fallback", async () => {
    setClipboard(undefined);
    setExecCommand(vi.fn().mockReturnValue(true));
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();

    await copyTextToClipboard("server-123");
    expect(document.activeElement).toBe(button);
    button.remove();
  });
});
