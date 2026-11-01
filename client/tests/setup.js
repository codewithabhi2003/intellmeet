// Browser APIs that jsdom lacks. Loaded before every test file (see vite.config.js `setupFiles`).
// Some components (e.g. landing/Reveal.jsx) call window.matchMedia while their module is being imported.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query) => ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false });
}
if (typeof window !== 'undefined' && !window.IntersectionObserver) {
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
}
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}
