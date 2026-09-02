import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

// jsdom's Blob has no `text()`, which every browser has had for years and
// which `readBackupInput` uses to read a picked file. Without it a unit test
// of the restore flow fails on the shim rather than on the app.
if (typeof Blob !== "undefined" && typeof Blob.prototype.text !== "function") {
  Blob.prototype.text = function text(this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

// jsdom ships no matchMedia, and several components ask it whether the app is
// installed or whether motion is reduced. Answers "no" to everything, which is
// the browser tab a unit test is standing in for.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false
  })) as typeof window.matchMedia;
}

// jsdom has no IntersectionObserver, which the two windowed lists (History and
// the catalog) use to grow as you scroll. A no-op stands in: a test never
// scrolls, so nothing should ever intersect, and without it the component
// throws on mount and renders nothing at all.
if (typeof globalThis.IntersectionObserver === "undefined") {
  class NoopIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds: readonly number[] = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  globalThis.IntersectionObserver = NoopIntersectionObserver as unknown as typeof IntersectionObserver;
}
