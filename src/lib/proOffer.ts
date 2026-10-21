import { createContext, useContext } from "react";

/**
 * Opens the Pro page (ADR-164): what Pro is, with samples, before any button
 * that charges. The app provides it; a locked card, banner or Settings row
 * calls it in place of buying. Where nothing provides it (a unit test, a lone
 * component) the caller falls back to offering the purchase directly.
 */
export const ProOfferContext = createContext<(() => void) | null>(null);

export function useProOffer(): (() => void) | null {
  return useContext(ProOfferContext);
}
