import "@testing-library/jest-dom";

// jsdom has no ResizeObserver, and recharts' <ResponsiveContainer> constructs
// one on mount — without this, any component containing a chart throws on
// render instead of failing an assertion. The stub never fires a callback, so
// the container keeps its 0x0 fallback size: charts mount but draw nothing,
// which is fine. Assert on the legend/headline around the chart, not on bars.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  value: ResizeObserverStub,
});
globalThis.ResizeObserver ??= ResizeObserverStub as never;

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
