// The Fiscal Year field is a grid of clickable years (this year ± 10) instead
// of a free number box, so nothing like 1900 or 99999 can be entered.
// Audit item AR-04.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { YearPicker } from "@/components/shared/YearPicker";
import { getYearRange, isYearInRange } from "@/lib/yearRange";

const THIS_YEAR = new Date().getFullYear();

/** Renders the picker with real state, like the forms do. */
function PickerWithState({ start, onPick }: { start: number | null; onPick?: (y: number) => void }) {
  const [value, setValue] = useState<number | null>(start);
  return (
    <YearPicker
      value={value}
      onChange={(year) => {
        setValue(year);
        onPick?.(year);
      }}
    />
  );
}

const openPicker = () => fireEvent.click(screen.getByRole("button", { name: /fiscal year/i }));

describe("getYearRange / isYearInRange", () => {
  it("gives 21 years, oldest first, with this year in the exact middle", () => {
    const years = getYearRange();
    expect(years).toHaveLength(21);
    expect(years[0]).toBe(THIS_YEAR - 10);
    expect(years[20]).toBe(THIS_YEAR + 10);
    expect(years[10]).toBe(THIS_YEAR);
  });

  it("accepts the edges of the window and rejects one past them", () => {
    expect(isYearInRange(THIS_YEAR - 10)).toBe(true);
    expect(isYearInRange(THIS_YEAR + 10)).toBe(true);
    expect(isYearInRange(THIS_YEAR - 11)).toBe(false);
    expect(isYearInRange(THIS_YEAR + 11)).toBe(false);
    expect(isYearInRange(1900)).toBe(false);
  });
});

describe("YearPicker", () => {
  it("shows the placeholder until a year is picked", () => {
    render(<PickerWithState start={null} />);
    expect(screen.getByRole("button", { name: /fiscal year/i })).toHaveTextContent("Select year");
  });

  it("opens a grid of only the 21 allowed years, with this year marked", () => {
    render(<PickerWithState start={null} />);
    openPicker();
    const boxes = screen.getAllByRole("option");
    expect(boxes).toHaveLength(21);
    expect(screen.getByRole("option", { name: `${THIS_YEAR}, this year` })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: String(THIS_YEAR - 11) })).toBeNull();
  });

  it("picking a box sets the year and closes the grid", () => {
    const onPick = vi.fn();
    render(<PickerWithState start={null} onPick={onPick} />);
    openPicker();
    fireEvent.click(screen.getByRole("option", { name: String(THIS_YEAR - 3) }));
    expect(onPick).toHaveBeenCalledWith(THIS_YEAR - 3);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("button", { name: /fiscal year/i })).toHaveTextContent(String(THIS_YEAR - 3));
  });

  it("the Last year shortcut picks the year before this one", () => {
    const onPick = vi.fn();
    render(<PickerWithState start={null} onPick={onPick} />);
    openPicker();
    fireEvent.click(screen.getByRole("button", { name: `Last year (${THIS_YEAR - 1})` }));
    expect(onPick).toHaveBeenCalledWith(THIS_YEAR - 1);
  });

  it("marks the current value as selected", () => {
    render(<PickerWithState start={THIS_YEAR + 2} />);
    openPicker();
    expect(screen.getByRole("option", { name: String(THIS_YEAR + 2) })).toHaveAttribute("aria-selected", "true");
  });

  it("arrow keys move focus: right by one year, down by one row of 7", () => {
    render(<PickerWithState start={THIS_YEAR} />);
    openPicker();
    const grid = screen.getByRole("listbox");
    const start = screen.getByRole("option", { name: `${THIS_YEAR}, this year` });
    start.focus();
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    expect(document.activeElement).toHaveTextContent(String(THIS_YEAR + 1));
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    expect(document.activeElement).toHaveTextContent(String(THIS_YEAR + 8));
  });

  it("still shows an old saved year that is outside the window", () => {
    render(<PickerWithState start={THIS_YEAR - 15} />);
    expect(screen.getByRole("button", { name: /fiscal year/i })).toHaveTextContent(String(THIS_YEAR - 15));
  });
});
