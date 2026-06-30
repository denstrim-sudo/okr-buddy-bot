import "@testing-library/jest-dom";

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

// jsdom polyfills required by Radix UI primitives (Select, Dropdown, etc.)
if (typeof Element !== "undefined") {
  if (!Element.prototype.hasPointerCapture) {
    // @ts-expect-error polyfill for jsdom
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    // @ts-expect-error polyfill for jsdom
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    // @ts-expect-error polyfill for jsdom
    Element.prototype.scrollIntoView = () => {};
  }
}

