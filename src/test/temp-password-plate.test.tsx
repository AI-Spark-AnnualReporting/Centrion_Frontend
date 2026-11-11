// The shared temporary-password plate: Copy must always give feedback, even
// when the browser refuses clipboard access.

import { describe, it, expect, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { TempPasswordPlate } from "@/components/shared/TempPasswordPlate";

const originalClipboard = navigator.clipboard;

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", { value, configurable: true });
}

afterEach(() => {
  setClipboard(originalClipboard);
  vi.useRealTimers();
});

describe("TempPasswordPlate", () => {
  it("shows the password with user-select all and extra actions", () => {
    render(
      <TempPasswordPlate
        password="Xk7#pQ2mRv9a"
        size="md"
        extraActions={<button type="button">↻ New password</button>}
      />,
    );
    const code = screen.getByTestId("temp-password-code");
    expect(code).toHaveTextContent("Xk7#pQ2mRv9a");
    expect(code).toHaveAttribute("aria-label", "Temporary password");
    expect(code.style.userSelect).toBe("all");
    expect(screen.getByRole("button", { name: "↻ New password" })).toBeInTheDocument();
  });

  it("uses 18px code for size lg and 16px for md", () => {
    const { unmount } = render(<TempPasswordPlate password="abc" size="lg" />);
    expect(screen.getByTestId("temp-password-code").style.fontSize).toBe("18px");
    unmount();
    render(<TempPasswordPlate password="abc" size="md" />);
    expect(screen.getByTestId("temp-password-code").style.fontSize).toBe("16px");
  });

  it("Copy writes the password and shows Copied! for 1800 ms", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<TempPasswordPlate password="Xk7#pQ2mRv9a" size="md" />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("temp-password-copy"));
    });
    expect(writeText).toHaveBeenCalledWith("Xk7#pQ2mRv9a");
    expect(screen.getByTestId("temp-password-copy")).toHaveTextContent("Copied!");
    act(() => {
      vi.advanceTimersByTime(1799);
    });
    expect(screen.getByTestId("temp-password-copy")).toHaveTextContent("Copied!");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByTestId("temp-password-copy")).toHaveTextContent("Copy");
  });

  it("falls back to a keyboard hint when the clipboard rejects", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    render(<TempPasswordPlate password="Xk7#pQ2mRv9a" size="md" />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("temp-password-copy"));
    });
    expect(screen.getByTestId("temp-password-copy").textContent).toMatch(
      /^Press (⌘C|Ctrl\+C) to copy$/,
    );
    expect(window.getSelection()?.toString()).toBe("Xk7#pQ2mRv9a");
  });

  it("falls back when there is no clipboard API at all", async () => {
    setClipboard(undefined);
    render(<TempPasswordPlate password="abc" size="lg" />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("temp-password-copy"));
    });
    expect(screen.getByTestId("temp-password-copy").textContent).toMatch(/to copy$/);
  });

  it("disables Copy while the parent is saving", () => {
    render(<TempPasswordPlate password="abc" size="md" disabled />);
    expect(screen.getByTestId("temp-password-copy")).toBeDisabled();
  });
});
