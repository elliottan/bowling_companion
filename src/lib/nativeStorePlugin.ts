import { unthenable } from "./nativePlugin";
import type { PurchaseOutcome } from "./pro";

/**
 * The iOS app's own StoreKit plugin (`ios/App/App/HeadpinStorePlugin.swift`):
 * Headpin Pro (ADR-158) and Apple's rating prompt (ADR-218). Kept apart from
 * `proStore.ts`, which is React, so a service can ask for a rating without it.
 */
export interface StorePlugin {
  purchase(options: { id: string }): Promise<{ status: PurchaseOutcome }>;
  entitlements(): Promise<{ ids: string[] }>;
  restore(): Promise<{ ids: string[] }>;
  /** Asks Apple to show its rating prompt, which Apple may decline to show. */
  requestReview(): Promise<void>;
  addListener(event: "entitlements", listener: (data: { ids: string[] }) => void): Promise<{ remove: () => Promise<void> }>;
}

/** The native plugin, loaded only where it exists, so the web bundle carries
 *  none of it. */
let storePlugin: Promise<StorePlugin> | null = null;

/** Registered once: Capacitor warns, and logs it, on every second registration
 *  of a name, which is every buy and every restore if this asks again. */
export function loadStorePlugin(): Promise<StorePlugin> {
  storePlugin ??= import("@capacitor/core").then(({ registerPlugin }) =>
    unthenable(registerPlugin<StorePlugin>("HeadpinStore"))
  );
  return storePlugin;
}
