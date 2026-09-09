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

// jsdom implements neither, and both are layout APIs a component legitimately
// reaches for: anything that sizes itself to its container (the report design
// preview, in the modal and on the Brand Identity page) observes its own box.
// Stubbed globally rather than per-file so a new consumer doesn't fail a suite
// that never mentions it. clientWidth stays 0 in jsdom, so measured components
// fall back to their seeded width — which is what the assertions expect.
if (!('ResizeObserver' in globalThis)) {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
}
