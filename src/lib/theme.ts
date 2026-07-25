import { useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";

const KEY = "theme";

/**
 * Theme lives in localStorage, not Dexie, because a pre-paint script in
 * index.html reads it before React mounts — that is what stops a light flash
 * before the dark palette lands. An async IndexedDB read can't run there.
 *
 * Stored values are only "light" | "dark"; absence means "follow the system",
 * which is also what lets the script keep tracking OS changes live.
 */
export function readThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Applies the resolved theme to <html> and keeps theme-color in step. */
function apply(pref: ThemePreference) {
  const dark = pref === "system" ? systemPrefersDark() : pref === "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#0f172a" : "#fff8ed");
}

export function useTheme(): [ThemePreference, (next: ThemePreference) => void] {
  const [pref, setPref] = useState<ThemePreference>(readThemePreference);

  // Only follow the OS while the user hasn't pinned a theme.
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  function update(next: ThemePreference) {
    setPref(next);
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // Private mode: the theme still applies for this session.
    }
    apply(next);
  }

  return [pref, update];
}
