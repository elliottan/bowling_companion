import { describe, expect, it, vi } from "vitest";

const listeners: Array<(e: { url: string }) => void> = [];
let launchUrl: { url: string } | undefined;
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn((_name: string, fn: (e: { url: string }) => void) => {
      listeners.push(fn);
      return Promise.resolve({ remove: () => Promise.resolve() });
    }),
    getLaunchUrl: vi.fn(() => Promise.resolve(launchUrl))
  }
}));

const { inAppLocation, listenForLinks, openInApp } = await import("./deepLink");

describe("inAppLocation", () => {
  it("opens a shared line on the same screen, query and all", () => {
    expect(inAppLocation("https://headpin.app/app?ld=20&tg=15&hand=right#/home/line")).toBe(
      "/?ld=20&tg=15&hand=right#/home/line"
    );
  });

  it("opens the free app's home for a bare link", () => {
    expect(inAppLocation("https://headpin.app/app")).toBe("/");
  });

  it("goes straight to a shared guide", () => {
    expect(inAppLocation("https://headpin.app/guides/layouts-101")).toBe("/#/home/guides/guide/layouts-101");
  });

  it("leaves the owner's copy, other pages and other sites alone", () => {
    expect(inAppLocation("https://headpin.app/score#/home")).toBeNull();
    expect(inAppLocation("https://headpin.app/legal")).toBeNull();
    expect(inAppLocation("https://example.com/app")).toBeNull();
    expect(inAppLocation("not a url")).toBeNull();
  });
});

describe("openInApp", () => {
  it("replaces the page with the link's screen", () => {
    const replace = vi.fn();
    expect(openInApp("https://headpin.app/app#/stats", { replace })).toBe(true);
    expect(replace).toHaveBeenCalledWith("/#/stats");
  });

  it("does nothing for a link that is not the app's", () => {
    const replace = vi.fn();
    expect(openInApp("https://headpin.app/legal", { replace })).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("listenForLinks", () => {
  it("listens for nothing on the web", async () => {
    expect(await listenForLinks(false, null)).toBe(false);
  });

  it("opens the link that launched the app once, not on the reload it causes", async () => {
    const opened: string[] = [];
    const open = (url: string) => (opened.push(url), true);
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    launchUrl = { url: "https://headpin.app/app#/history" };
    await listenForLinks(true, storage, open);
    await listenForLinks(true, storage, open);
    expect(opened).toEqual(["https://headpin.app/app#/history"]);
    listeners[0]({ url: "https://headpin.app/app#/stats" });
    expect(opened[opened.length - 1]).toBe("https://headpin.app/app#/stats");
  });
});
