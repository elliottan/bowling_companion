import { useEffect, useRef, useState } from "react";

/**
 * The iPhone app's tab bar, drawn by UIKit (ADR-161,
 * `ios/App/App/HeadpinTabBarPlugin.swift`).
 *
 * The page still owns what the tabs are, which is chosen, and when the bar
 * steps aside; the phone owns how it looks, so it follows each iOS release
 * without a change here. If the plugin is missing (an older build of the app)
 * the hook reports `failed` and the page draws its own bar, as the web does.
 */

export interface TabBarItem {
  id: string;
  title: string;
}

export interface TabBarPlugin {
  configure(options: {
    items: TabBarItem[];
    selected: string;
    dark: boolean;
    accent: string;
  }): Promise<{ height: number }>;
  select(options: { id: string }): Promise<void>;
  setHidden(options: { hidden: boolean }): Promise<void>;
  addListener(event: "select", listener: (data: { id: string }) => void): Promise<{ remove: () => Promise<void> }>;
  addListener(event: "layout", listener: (data: { height: number }) => void): Promise<{ remove: () => Promise<void> }>;
}

export async function loadTabBarPlugin(): Promise<TabBarPlugin> {
  const { registerPlugin } = await import("@capacitor/core");
  return registerPlugin<TabBarPlugin>("HeadpinTabBar");
}

/** Room to leave for the bar before the phone has said how tall it is: a bar
 *  and the home indicator on a current iPhone. A reservation, replaced by the
 *  measured height, so the page does not jump when it arrives. */
export const DEFAULT_TAB_BAR_HEIGHT = 83;

/** `rgb(var(--color-accent))` as `#rrggbb`, for the chosen tab. */
function accentHex(): string {
  const triple = getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim();
  const [r, g, b] = triple.split(/\s+/).map(Number);
  if ([r, g, b].some((n) => !Number.isFinite(n))) return "#1b5148";
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function isDark(): boolean {
  return document.documentElement.dataset.theme === "dark";
}

export type TabBarStatus = "pending" | "ready" | "failed";

interface UseNativeTabBarOptions {
  /** Whether the phone's own bar is to be used at all: the iPhone app. */
  enabled: boolean;
  items: ReadonlyArray<TabBarItem>;
  active: string;
  /** A sheet, a full screen or the keyboard is in front of the bar. */
  hidden: boolean;
  onSelect: (id: string) => void;
  plugin?: () => Promise<TabBarPlugin>;
}

/**
 * Puts the native bar on screen and keeps it in step with the page. Returns
 * its state and the height the page has to leave clear beneath its content.
 */
export function useNativeTabBar({
  enabled,
  items,
  active,
  hidden,
  onSelect,
  plugin = loadTabBarPlugin
}: UseNativeTabBarOptions): { status: TabBarStatus; height: number } {
  const [status, setStatus] = useState<TabBarStatus>(enabled ? "pending" : "failed");
  const [height, setHeight] = useState(DEFAULT_TAB_BAR_HEIGHT);
  const handle = useRef<TabBarPlugin | null>(null);
  // Read through refs so the setup below runs once, not on every tap.
  const latest = useRef({ items, active, onSelect });
  useEffect(() => {
    latest.current = { items, active, onSelect };
  });

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const removers: Array<() => Promise<void>> = [];
    void plugin()
      .then(async (bar) => {
        removers.push((await bar.addListener("select", ({ id }) => latest.current.onSelect(id))).remove);
        removers.push((await bar.addListener("layout", (data) => alive && setHeight(data.height))).remove);
        const { height: measured } = await bar.configure({
          items: [...latest.current.items],
          selected: latest.current.active,
          dark: isDark(),
          accent: accentHex()
        });
        if (!alive) return;
        handle.current = bar;
        setHeight(measured > 0 ? measured : DEFAULT_TAB_BAR_HEIGHT);
        setStatus("ready");
      })
      .catch(() => {
        if (alive) setStatus("failed");
      });
    return () => {
      alive = false;
      handle.current = null;
      for (const remove of removers) void remove().catch(() => {});
    };
  }, [enabled, plugin]);

  // The app's theme is the page's, not the phone's, so the bar is told.
  useEffect(() => {
    if (status !== "ready") return;
    const restyle = () =>
      void handle.current
        ?.configure({
          items: [...latest.current.items],
          selected: latest.current.active,
          dark: isDark(),
          accent: accentHex()
        })
        .catch(() => {});
    const observer = new MutationObserver(restyle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [status]);

  useEffect(() => {
    if (status === "ready") void handle.current?.select({ id: active }).catch(() => {});
  }, [status, active]);

  useEffect(() => {
    if (status === "ready") void handle.current?.setHidden({ hidden }).catch(() => {});
  }, [status, hidden]);

  return { status, height };
}
