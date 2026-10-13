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

/**
 * Brings the catalog table up to date, then the arsenal's photos with it.
 *
 * The photo step runs whatever the fetch did, offline included: it compares
 * against the catalog already on this device, which is newer than many a
 * ball's snapshot even when the network is not there.
 */
export async function syncCatalog(onState?: (state: SyncState) => void): Promise<void> {
  await syncCatalogTable(onState);
  await refreshArsenalPhotos().catch(() => 0);
}

/**
 * The launch-time sync, for an arsenal that has something to gain from it.
 *
 * Launch syncs the catalog only to bring linked balls' photos up to date
 * (ADR-143), so a device with no linked ball skips it. That is not only thrift:
 * a first sync parses the whole catalog (about a megabyte) and writes every
 * row, and run unasked a few seconds after launch it took enough frames from
 * whatever the bowler was opening to stutter the session sheet's slide. A
 * device with linked balls pays it once per catalog version, as the catalog
 * screen always has.
 */
export async function syncCatalogForArsenal(): Promise<boolean> {
  const linked = await db.balls.filter((b) => !!b.catalog_ref_id).count();
  if (linked === 0) return false;
  await syncCatalog();
  return true;
}

/**
 * Points every linked arsenal ball at the photo its catalog entry has now.
 *
 * A ball keeps a snapshot of its catalog entry from the moment it was linked
 * (ADR-007), so the arsenal draws without the catalog loaded. The photo in it
 * went stale whenever the catalog's photo changed: Pyramid Path's was
 * re-cut under a new file name, and the bowler's own Path kept the old one,
 * with its white rim, while the catalog card beside it showed the new
 * (ADR-143). Only the photo follows the catalog. The specs in the snapshot
 * were read for the ball's own weight and are the bowler's record of it.
 *
 * A catalog entry that has gone leaves the ball as it is; one whose photo was
 * taken down takes the ball's photo down with it.
 */
export async function refreshArsenalPhotos(): Promise<number> {
  const balls = await db.balls.toArray();
  let changed = 0;
  for (const ball of balls) {
    const snap = ball.catalog_snapshot;
    if (ball.id == null || !ball.catalog_ref_id || !snap) continue;
    const entry = await db.ball_catalog.get(ball.catalog_ref_id);
    if (!entry || entry.imageThumb === snap.imageThumb) continue;
    await db.balls.update(ball.id, { catalog_snapshot: { ...snap, imageThumb: entry.imageThumb } });
    changed++;
  }
  return changed;
}

async function syncCatalogTable(onState?: (state: SyncState) => void): Promise<void> {
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
