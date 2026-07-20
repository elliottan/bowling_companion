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
  const localCount = await db.ball_catalog.count();
  if (storedVersion !== null && storedVersion >= manifest.version && localCount > 0) {
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

  // Upsert all: the catalog is read-only, server-authoritative reference data
  // keyed by stable id, so re-putting every ball updates existing entries
  // (corrected specs, new images, added colorways) as well as inserting new
  // ones. Supersedes the earlier append-only behaviour (ADR-010), which left
  // already-synced devices stuck on stale data. The user's arsenal lives in a
  // separate `balls` table and is untouched.
  await db.ball_catalog.bulkPut(remoteBalls);
  // Drop catalog ids that no longer exist remotely (keeps the table exact).
  const remoteIds = new Set(remoteBalls.map((b) => b.id));
  const staleIds = (await db.ball_catalog.toArray())
    .map((b) => b.id)
    .filter((id) => !remoteIds.has(id));
  if (staleIds.length > 0) {
    await db.ball_catalog.bulkDelete(staleIds);
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
