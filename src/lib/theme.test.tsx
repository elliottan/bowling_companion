import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readThemePreference, useTheme, type ThemePreference } from "./theme";

function setSystemDark(dark: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: dark && query.includes("dark"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {}
  }));
}

function Picker() {
  const [pref, setPref] = useTheme();
  return (
    <div>
      <span data-testid="pref">{pref}</span>
      {(["system", "light", "dark"] as ThemePreference[]).map((p) => (
        <button key={p} onClick={() => setPref(p)}>
          {p}
        </button>
      ))}
    </div>
  );
}

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
    setSystemDark(false);
    document.documentElement.removeAttribute("data-theme");
  });

  it("reads an explicit preference, and treats anything else as system", () => {
    localStorage.setItem("theme", "dark");
    expect(readThemePreference()).toBe("dark");

    localStorage.setItem("theme", "nonsense");
    expect(readThemePreference()).toBe("system");

    localStorage.removeItem("theme");
    expect(readThemePreference()).toBe("system");
  });

  it("an explicit choice persists and lands on <html>", () => {
    render(<Picker />);
    fireEvent.click(screen.getByText("dark"));

    expect(screen.getByTestId("pref").textContent).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("system clears the stored value and resolves against the OS", () => {
    setSystemDark(true);
    localStorage.setItem("theme", "light");
    render(<Picker />);
    fireEvent.click(screen.getByText("system"));

    expect(localStorage.getItem("theme")).toBeNull();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("keeps the theme-color meta tag in step", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);

    render(<Picker />);
    fireEvent.click(screen.getByText("dark"));
    expect(meta.getAttribute("content")).toBe("#0f172a");
    fireEvent.click(screen.getByText("light"));
    expect(meta.getAttribute("content")).toBe("#fff8ed");

    meta.remove();
  });
});
