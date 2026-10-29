import { describe, expect, it, vi } from "vitest";
import { keepArsenalPhotos, warmArsenalImages } from "./ballImageCache";

function fakeCache(cached: string[], failing: string[] = []) {
  const store = new Set(cached);
  const cache = {
    match: vi.fn(async (url: string) => (store.has(url) ? new Response("") : undefined)),
    add: vi.fn(async (url: string) => {
      if (failing.includes(url)) throw new Error("offline");
      store.add(url);
    })
  };
  const open = vi.fn(async () => cache as unknown as Cache);
  return { cache, open, store };
}

describe("warmArsenalImages", () => {
  it("fetches only the photos the cache does not already hold", async () => {
    const { cache, open, store } = fakeCache(["/a.webp"]);
    const added = await warmArsenalImages({
      caches: { open },
      urls: async () => ["/a.webp", "/b.webp", "/c.webp"]
    });
    expect(open).toHaveBeenCalledWith("catalog-images");
    expect(cache.add.mock.calls.map(([url]) => url)).toEqual(["/b.webp", "/c.webp"]);
    expect(added).toBe(2);
    expect(store.has("/c.webp")).toBe(true);
  });

  it("keeps going past a photo that fails to download", async () => {
    const { open } = fakeCache([], ["/b.webp"]);
    const added = await warmArsenalImages({
      caches: { open },
      urls: async () => ["/a.webp", "/b.webp"]
    });
    expect(added).toBe(1);
  });

  it("does nothing without Cache Storage", async () => {
    const urls = vi.fn(async () => ["/a.webp"]);
    expect(await warmArsenalImages({ caches: null, urls })).toBe(0);
    expect(urls).not.toHaveBeenCalled();
  });

  it("swallows a cache that cannot be opened", async () => {
    const open = vi.fn(async () => {
      throw new Error("quota");
    });
    expect(await warmArsenalImages({ caches: { open }, urls: async () => ["/a.webp"] })).toBe(0);
  });

  it("reads the arsenal from the database by default", async () => {
    // jsdom has no Cache Storage, so the default path bows out cleanly.
    expect(await warmArsenalImages()).toBe(0);
  });

  it("does nothing in the store app, which runs no worker to read the cache back (ADR-155)", async () => {
    const { open } = fakeCache([]);
    vi.stubGlobal("caches", { open });
    vi.stubGlobal("Capacitor", { isNativePlatform: () => true });
    try {
      expect(await warmArsenalImages()).toBe(0);
      expect(open).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("keepArsenalPhotos", () => {
  function fakeStore(kept: string[], failing: string[] = []) {
    const files = new Set(kept);
    return {
      files,
      lookup: vi.fn(async (url: string) => (files.has(url) ? `file://${url}` : null)),
      save: vi.fn(async (url: string) => {
        if (!failing.includes(url)) files.add(url);
      })
    };
  }

  it("saves only the arsenal photos not already on the phone, from headpin.app", async () => {
    const store = fakeStore(["https://headpin.app/a.webp"]);
    const kept = await keepArsenalPhotos({ store, urls: async () => ["/a.webp", "/b.webp"] });
    expect(store.save.mock.calls.map(([url]) => url)).toEqual(["https://headpin.app/b.webp"]);
    expect(kept).toBe(1);
  });

  it("keeps going past a photo that fails to save", async () => {
    const store = fakeStore([], ["https://headpin.app/a.webp"]);
    expect(await keepArsenalPhotos({ store, urls: async () => ["/a.webp", "/b.webp"] })).toBe(1);
    expect(store.files.has("https://headpin.app/b.webp")).toBe(true);
  });

  it("does nothing on the web", async () => {
    const urls = vi.fn(async () => ["/a.webp"]);
    expect(await keepArsenalPhotos({ store: null, urls })).toBe(0);
    expect(urls).not.toHaveBeenCalled();
  });
});
