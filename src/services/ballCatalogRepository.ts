import { db } from "../db/bowlingDb";
import { getSetting, setSetting } from "./bowlingRepository";
import type { CatalogBall, CatalogManifest } from "../types/catalog";

const CATALOG_VERSION_KEY = "catalog_version";
const CATALOG_GENERATED_AT_KEY = "catalog_generated_at";

export type SyncState =
  | { status: "idle" }
  | { status: "syncing" }
  | { status: "done"; version: number; generatedAt: string }
  | { status: "error"; message: string };

export async function getCatalogManifestRemote(): Promise<CatalogManifest> {
  const res = await fetch("/catalog/catalog-manifest.json");
  if (!res.ok) throw new Error(`Failed to fetch catalog manifest: ${res.status}`);
  return res.json() as Promise<CatalogManifest>;
}

export async function getStoredCatalogVersion(): Promise<number | null> {
  const v = await getSetting(CATALOG_VERSION_KEY);
  if (v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function syncCatalog(onState?: (state: SyncState) => void): Promise<void> {
  onState?.({ status: "syncing" });

  let manifest: CatalogManifest;
  try {
    manifest = await getCatalogManifestRemote();
  } catch (err) {
    onState?.({ status: "error", message: err instanceof Error ? err.message : String(err) });
    return;
  }

  const storedVersion = await getStoredCatalogVersion();
  if (storedVersion !== null && storedVersion >= manifest.version) {
    onState?.({ status: "done", version: manifest.version, generatedAt: manifest.generatedAt });
    return;
  }

  let remoteBalls: CatalogBall[];
  try {
    const res = await fetch("/catalog/catalog.json");
    if (!res.ok) throw new Error(`Failed to fetch catalog: ${res.status}`);
    remoteBalls = await res.json() as CatalogBall[];
  } catch (err) {
    onState?.({ status: "error", message: err instanceof Error ? err.message : String(err) });
    return;
  }

  // Append-only: only insert balls whose id is not already present.
  const existingIds = new Set((await db.ball_catalog.toArray()).map((b) => b.id));
  const newBalls = remoteBalls.filter((b) => !existingIds.has(b.id));

  if (newBalls.length > 0) {
    await db.ball_catalog.bulkPut(newBalls);
  }

  await setSetting(CATALOG_VERSION_KEY, String(manifest.version));
  await setSetting(CATALOG_GENERATED_AT_KEY, manifest.generatedAt);

  onState?.({ status: "done", version: manifest.version, generatedAt: manifest.generatedAt });
}

export async function getAllCatalog(): Promise<CatalogBall[]> {
  return db.ball_catalog.toArray();
}

export async function getCatalogBall(id: string): Promise<CatalogBall | undefined> {
  return db.ball_catalog.get(id);
}
