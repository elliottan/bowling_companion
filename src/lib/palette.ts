import { useEffect, useState } from "react";

/**
 * The app's accent color, separate from light and dark (ADR-164). Felt is the
 * one every bowler has; the rest come with Pro. A palette only changes the
 * accent tokens (`src/index.css`), so it works in both themes and nothing else
 * in the app has to know which one is on.
 */
export type PaletteId = "felt" | "ocean" | "sunset" | "grape" | "rose";

export interface Palette {
  id: PaletteId;
  name: string;
  /** A color for the swatch, the same in both themes. */
  swatch: string;
  /** Needs Pro. */
  pro: boolean;
}

export const DEFAULT_PALETTE: PaletteId = "felt";

export const PALETTES: readonly Palette[] = [
  { id: "felt", name: "Felt", swatch: "#2d8a78", pro: false },
  { id: "ocean", name: "Ocean", swatch: "#3b82f6", pro: true },
  { id: "sunset", name: "Sunset", swatch: "#f97316", pro: true },
  { id: "grape", name: "Grape", swatch: "#8b5cf6", pro: true },
  { id: "rose", name: "Rose", swatch: "#f43f5e", pro: true }
];

const KEY = "palette";

const IDS = new Set<string>(PALETTES.map((p) => p.id));

/**
 * The chosen palette. In localStorage beside the theme, for the same reason: a
 * pre-paint script in the app's shell reads it before React mounts, so the
 * first paint is already in the bowler's color.
 */
export function readPalette(): PaletteId {
  try {
    const v = localStorage.getItem(KEY);
    return v && IDS.has(v) ? (v as PaletteId) : DEFAULT_PALETTE;
  } catch {
    return DEFAULT_PALETTE;
  }
}

/** Puts a palette on <html>. Felt is the absence of one. */
export function applyPalette(id: PaletteId) {
  if (id === DEFAULT_PALETTE) delete document.documentElement.dataset.palette;
  else document.documentElement.dataset.palette = id;
}

export function usePalette(): [PaletteId, (next: PaletteId) => void] {
  const [id, setId] = useState<PaletteId>(readPalette);

  function update(next: PaletteId) {
    setId(next);
    try {
      if (next === DEFAULT_PALETTE) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // Private mode: the palette still applies for this session.
    }
    applyPalette(next);
  }

  return [id, update];
}

/**
 * Keeps <html> on the right palette for what is open. A palette that needs Pro
 * is shown only while Pro is open, so a bowler whose purchase is refunded, or
 * who opens the free web copy with a stored choice, sees Felt rather than a
 * color they cannot change; the choice is kept and comes back with Pro.
 */
export function useAppliedPalette(proOpen: boolean) {
  useEffect(() => {
    const chosen = readPalette();
    const pro = PALETTES.find((p) => p.id === chosen)?.pro ?? false;
    applyPalette(pro && !proOpen ? DEFAULT_PALETTE : chosen);
  }, [proOpen]);
}
