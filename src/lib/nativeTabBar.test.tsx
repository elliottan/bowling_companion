import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { isIOSApp } from "./platform";
import { useNativeTabBar, type TabBarPlugin } from "./nativeTabBar";

const ITEMS = [
  { id: "dashboard", title: "Home" },
  { id: "settings", title: "Settings" }
];

function fakePlugin() {
  const listeners = new Map<string, (data: never) => void>();
  const bar = {
    configure: vi.fn().mockResolvedValue({ height: 91 }),
    select: vi.fn().mockResolvedValue(undefined),
    setHidden: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn(async (event: string, listener: (data: never) => void) => {
      listeners.set(event, listener);
      return { remove: vi.fn().mockResolvedValue(undefined) };
    })
  };
  return { bar: bar as unknown as TabBarPlugin, mocks: bar, listeners };
}

function setup(over: Partial<Parameters<typeof useNativeTabBar>[0]> = {}) {
  const { bar, mocks, listeners } = fakePlugin();
  const onSelect = vi.fn();
  // One function for the life of the hook, as the app's own loader is.
  const plugin = async () => bar;
  const hook = renderHook(
    (props: Parameters<typeof useNativeTabBar>[0]) => useNativeTabBar(props),
    {
      initialProps: {
        enabled: true,
        items: ITEMS,
        active: "dashboard",
        hidden: false,
        onSelect,
        plugin,
        ...over
      }
    }
  );
  return { hook, mocks, listeners, onSelect, plugin };
}

describe("useNativeTabBar", () => {
  it("puts the bar up with the tabs, and reports the height the phone measured", async () => {
    const { hook, mocks } = setup();
    expect(hook.result.current.status).toBe("pending");
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
    expect(hook.result.current.height).toBe(91);
    expect(mocks.configure).toHaveBeenCalledWith(
      expect.objectContaining({ items: ITEMS, selected: "dashboard", dark: false })
    );
  });

  it("passes a tap on the bar to the page", async () => {
    const { hook, listeners, onSelect } = setup();
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
    act(() => (listeners.get("select") as (d: { id: string }) => void)({ id: "settings" }));
    expect(onSelect).toHaveBeenCalledWith("settings");
  });

  it("follows the height when the phone lays the bar out again", async () => {
    const { hook, listeners } = setup();
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
    act(() => (listeners.get("layout") as (d: { height: number }) => void)({ height: 64 }));
    expect(hook.result.current.height).toBe(64);
  });

  it("chooses the tab the page moved to, and steps aside when covered", async () => {
    const { hook, mocks, plugin } = setup();
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
    hook.rerender({ enabled: true, items: ITEMS, active: "settings", hidden: true, onSelect: vi.fn(), plugin });
    await waitFor(() => expect(mocks.select).toHaveBeenCalledWith({ id: "settings" }));
    await waitFor(() => expect(mocks.setHidden).toHaveBeenLastCalledWith({ hidden: true }));
  });

  it("tells the bar the app's theme, which is the page's and not the phone's", async () => {
    const { hook, mocks } = setup();
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
    document.documentElement.dataset.theme = "dark";
    await waitFor(() => expect(mocks.configure).toHaveBeenLastCalledWith(expect.objectContaining({ dark: true })));
    delete document.documentElement.dataset.theme;
  });

  it("falls back to the page's own bar when the app has no native one", async () => {
    const hook = renderHook(() =>
      useNativeTabBar({
        enabled: true,
        items: ITEMS,
        active: "dashboard",
        hidden: false,
        onSelect: vi.fn(),
        plugin: async () => {
          throw new Error("not implemented");
        }
      })
    );
    await waitFor(() => expect(hook.result.current.status).toBe("failed"));
  });

  it("does nothing outside the iPhone app", () => {
    const plugin = vi.fn();
    const { result } = renderHook(() =>
      useNativeTabBar({ enabled: false, items: ITEMS, active: "dashboard", hidden: false, onSelect: vi.fn(), plugin })
    );
    expect(result.current.status).toBe("failed");
    expect(plugin).not.toHaveBeenCalled();
  });
});

describe("isIOSApp", () => {
  it("is true only for the native iOS shell", () => {
    expect(isIOSApp({ Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" } })).toBe(true);
    expect(isIOSApp({ Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" } })).toBe(false);
    expect(isIOSApp({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" } })).toBe(false);
    expect(isIOSApp({})).toBe(false);
  });
});
