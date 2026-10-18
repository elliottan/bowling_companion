import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isNativeApp } from "./platform";
import type { ProStore, PurchaseOutcome } from "./pro";

/**
 * Headpin Pro in the iOS app, through the app's own StoreKit plugin
 * (`ios/App/App/HeadpinStorePlugin.swift`, ADR-158).
 *
 * The receipt is the truth. The page keeps a copy of the last answer so an
 * owner never sees a locked card flash while StoreKit is asked again, and asks
 * again on every launch, which StoreKit answers from the phone, offline too.
 */

/** The one product: a non-consumable, bought once per Apple ID. */
export const PRO_PRODUCT_ID = "app.headpin.pro";

const OWNED_KEY = "headpin.proOwned";

export interface StorePlugin {
  product(options: { id: string }): Promise<{ id?: string; name?: string; price?: string }>;
  purchase(options: { id: string }): Promise<{ status: PurchaseOutcome }>;
  entitlements(): Promise<{ ids: string[] }>;
  restore(): Promise<{ ids: string[] }>;
  addListener(event: "entitlements", listener: (data: { ids: string[] }) => void): Promise<{ remove: () => Promise<void> }>;
}

interface CapacitorPlatform {
  getPlatform?: () => string;
}

/** Whether this copy sells Pro: the iOS app. The Android app sells it once Play
 *  Billing is in, and leaves everything open until then (PRO-LAUNCH, phase 5). */
export function sellsPro(scope: object = globalThis, native = isNativeApp(scope)): boolean {
  const platform = (scope as { Capacitor?: CapacitorPlatform }).Capacitor?.getPlatform?.();
  return native && platform === "ios";
}

/** The native plugin, loaded only where it exists, so the web bundle carries
 *  none of it. */
export async function loadStorePlugin(): Promise<StorePlugin> {
  const { registerPlugin } = await import("@capacitor/core");
  return registerPlugin<StorePlugin>("HeadpinStore");
}

function localStorageOrNull(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The iOS app's Pro, for `ProAccessContext`; null where nothing sells it.
 */
export function useProStore(
  enabled: boolean = sellsPro(),
  plugin: () => Promise<StorePlugin> = loadStorePlugin,
  storage: Pick<Storage, "getItem" | "setItem"> | null = localStorageOrNull()
): ProStore | null {
  const [owned, setOwned] = useState(() => storage?.getItem(OWNED_KEY) === "1");
  const [price, setPrice] = useState<string | null>(null);
  const storageRef = useRef(storage);
  // Set once a purchase, a restore or the store's own news has answered, so
  // the launch's first ask, if it lands later, cannot put an older answer back.
  const answered = useRef(false);

  const record = useCallback((ids: string[]) => {
    answered.current = true;
    const has = ids.includes(PRO_PRODUCT_ID);
    setOwned(has);
    try {
      storageRef.current?.setItem(OWNED_KEY, has ? "1" : "0");
    } catch {
      // A full or blocked store only costs the next launch its head start.
    }
    return has;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let remove: (() => void) | undefined;
    void plugin()
      .then(async (store) => {
        const handle = await store.addListener("entitlements", ({ ids }) => {
          if (alive) record(ids);
        });
        remove = () => void handle.remove();
        if (!alive) remove();
        const [entitled, product] = await Promise.allSettled([store.entitlements(), store.product({ id: PRO_PRODUCT_ID })]);
        if (!alive) return;
        if (entitled.status === "fulfilled" && !answered.current) record(entitled.value.ids);
        if (product.status === "fulfilled") setPrice(product.value.price ?? null);
      })
      .catch(() => {
        // No store to ask (an old build): the last answer stands.
      });
    return () => {
      alive = false;
      remove?.();
    };
  }, [enabled, plugin, record]);

  return useMemo(() => {
    if (!enabled) return null;
    return {
      owned,
      price,
      async buy() {
        const { status } = await (await plugin()).purchase({ id: PRO_PRODUCT_ID });
        if (status === "purchased") record([PRO_PRODUCT_ID]);
        return status;
      },
      async restore() {
        const { ids } = await (await plugin()).restore();
        return record(ids);
      }
    };
  }, [enabled, owned, price, plugin, record]);
}
