import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { PRO_PRODUCT_ID, sellsPro, useProStore, type StorePlugin } from "./proStore";

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map };
}

function fakePlugin(over: Partial<StorePlugin> = {}) {
  let listener: ((d: { ids: string[] }) => void) | undefined;
  const plugin: StorePlugin = {
    purchase: vi.fn(async () => ({ status: "purchased" as const })),
    entitlements: vi.fn(async () => ({ ids: [] as string[] })),
    restore: vi.fn(async () => ({ ids: [PRO_PRODUCT_ID] })),
    requestReview: vi.fn(async () => {}),
    addListener: vi.fn(async (_e, fn) => {
      listener = fn;
      return { remove: async () => {} };
    }),
    ...over
  };
  return { plugin, load: async () => plugin, emit: (ids: string[]) => listener?.({ ids }) };
}

describe("sellsPro", () => {
  it("is the iOS app only", () => {
    const ios = { Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" } };
    const android = { Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" } };
    expect(sellsPro(ios)).toBe(true);
    expect(sellsPro(android)).toBe(false);
    expect(sellsPro({})).toBe(false);
  });
});

describe("useProStore", () => {
  it("is nothing where Pro is not sold", () => {
    const { result } = renderHook(() => useProStore(false, fakePlugin().load, null));
    expect(result.current).toBeNull();
  });

  it("asks the App Store who owns Pro", async () => {
    const { plugin, load } = fakePlugin();
    const { result } = renderHook(() => useProStore(true, load, memoryStorage()));
    await waitFor(() => expect(plugin.entitlements).toHaveBeenCalled());
    expect(result.current?.owned).toBe(false);
  });

  it("starts from the last answer, so an owner never sees a lock flash", () => {
    const { load } = fakePlugin({ entitlements: () => new Promise(() => {}) });
    const { result } = renderHook(() => useProStore(true, load, memoryStorage({ "headpin.proOwned": "1" })));
    expect(result.current?.owned).toBe(true);
  });

  it("opens Pro once it is bought, and remembers it", async () => {
    const { plugin, load } = fakePlugin();
    const storage = memoryStorage();
    const { result } = renderHook(() => useProStore(true, load, storage));
    await waitFor(() => expect(plugin.entitlements).toHaveBeenCalled());
    await act(async () => {
      expect(await result.current!.buy()).toBe("purchased");
    });
    expect(result.current?.owned).toBe(true);
    expect(storage.map.get("headpin.proOwned")).toBe("1");
  });

  it("leaves Pro locked when the purchase is closed", async () => {
    const { load } = fakePlugin({ purchase: async () => ({ status: "cancelled" }) });
    const { result } = renderHook(() => useProStore(true, load, memoryStorage()));
    await act(async () => {
      expect(await result.current!.buy()).toBe("cancelled");
    });
    expect(result.current?.owned).toBe(false);
  });

  it("restores a purchase made on this Apple ID", async () => {
    const { load } = fakePlugin();
    const { result } = renderHook(() => useProStore(true, load, memoryStorage()));
    await act(async () => {
      expect(await result.current!.restore()).toBe(true);
    });
    expect(result.current?.owned).toBe(true);
  });

  it("follows a purchase that finishes away from the tap, or a refund", async () => {
    const { plugin, load, emit } = fakePlugin();
    const storage = memoryStorage();
    const { result } = renderHook(() => useProStore(true, load, storage));
    await waitFor(() => expect(plugin.entitlements).toHaveBeenCalled());
    act(() => emit([PRO_PRODUCT_ID]));
    expect(result.current?.owned).toBe(true);
    act(() => emit([]));
    expect(result.current?.owned).toBe(false);
  });

  it("keeps the last answer when there is no store to ask", async () => {
    const { result } = renderHook(() =>
      useProStore(true, () => Promise.reject(new Error("no plugin")), memoryStorage({ "headpin.proOwned": "1" }))
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current?.owned).toBe(true);
  });
});
