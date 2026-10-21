/**
 * Ball photos kept on the phone, in the store apps only (ADR-162).
 *
 * The app does not carry the photos (ADR-154), so each is fetched from
 * headpin.app, and with only the web view's HTTP cache behind that, a ball
 * seen once could be gone the next launch, and every photo was gone offline.
 * This keeps a copy in the app's own storage the first time one loads and
 * serves it from there afterwards.
 *
 * The store knows nothing about Capacitor: it is handed a `PhotoFiles` and, for
 * the bytes, a `fetch`, so a unit test drives it with a fake disk. The real
 * disk is in `nativePhotoStore.ts`, which the web app's bundle never loads.
 *
 * It is a convenience and never a dependency: every failure here is swallowed
 * and reads as "not stored", so the caller falls back to the network exactly as
 * it did before this existed.
 */

export interface PhotoFile {
  name: string;
  size: number;
  /** When it was written, in ms. The oldest are evicted first. */
  mtime: number;
}

export interface PhotoFiles {
  list(): Promise<PhotoFile[]>;
  /** The address the web view can show the stored file at. */
  uri(name: string): Promise<string>;
  write(name: string, base64: string): Promise<void>;
  remove(name: string): Promise<void>;
}

export interface PhotoStoreOptions {
  /** Most bytes kept. A write that goes over evicts the oldest until it fits. */
  maxBytes?: number;
  /** A photo larger than this is not worth the room and is not kept. */
  maxPhotoBytes?: number;
  fetchBytes?: (url: string) => Promise<Blob>;
  now?: () => number;
}

/** About 800 photos at the catalog's usual size. The whole set is ~53 MB, so
 *  this keeps what a bowler actually looks at, not everything. */
export const PHOTO_STORE_MAX_BYTES = 25 * 1024 * 1024;
const MAX_PHOTO_BYTES = 1024 * 1024;

/** A stable file name for a URL: readable, and told apart by a hash of the whole
 *  address, so two paths that sanitize alike do not share a file. */
export function photoFileName(url: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < url.length; i++) {
    const c = url.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x811c9dc5) >>> 0;
  }
  const path = url.replace(/^[a-z]+:\/\/[^/]+/i, "").split(/[?#]/)[0];
  const ext = /\.(webp|png|jpe?g|gif|avif)$/i.exec(path)?.[1]?.toLowerCase() ?? "img";
  const stem = path
    .replace(/\.[a-z]+$/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-60);
  return `${stem || "photo"}-${h1.toString(36)}${h2.toString(36)}.${ext}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error ?? new Error("The photo could not be read"));
    reader.readAsDataURL(blob);
  });
}

async function defaultFetchBytes(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Photo request failed: ${res.status}`);
  return res.blob();
}

export interface PhotoStore {
  /** The stored copy's address, or null when there is none. */
  lookup(url: string): Promise<string | null>;
  /** Keeps a photo, once. Resolves when it is on disk or has been given up on. */
  save(url: string): Promise<void>;
}

export function createPhotoStore(files: PhotoFiles, options: PhotoStoreOptions = {}): PhotoStore {
  const maxBytes = options.maxBytes ?? PHOTO_STORE_MAX_BYTES;
  const maxPhotoBytes = options.maxPhotoBytes ?? MAX_PHOTO_BYTES;
  const fetchBytes = options.fetchBytes ?? defaultFetchBytes;
  const now = options.now ?? Date.now;

  // What is on disk, read once. A directory listing per photo would put a disk
  // read behind every tile in a grid of a couple of hundred.
  let index: Promise<Map<string, PhotoFile>> | null = null;
  const loadIndex = () => {
    index ??= files
      .list()
      .then((all) => new Map(all.map((f) => [f.name, f])))
      .catch(() => new Map<string, PhotoFile>());
    return index;
  };

  // Writes go one at a time. A grid fills a screen of tiles at once, and a
  // dozen simultaneous writes would compete with the scroll for the disk.
  let queue: Promise<void> = Promise.resolve();
  const inFlight = new Set<string>();

  async function evictFor(known: Map<string, PhotoFile>, incoming: number) {
    let total = incoming;
    for (const f of known.values()) total += f.size;
    if (total <= maxBytes) return;
    const oldest = [...known.values()].sort((a, b) => a.mtime - b.mtime);
    for (const f of oldest) {
      if (total <= maxBytes) break;
      await files.remove(f.name).catch(() => {});
      known.delete(f.name);
      total -= f.size;
    }
  }

  async function saveNow(url: string) {
    const known = await loadIndex();
    const name = photoFileName(url);
    if (known.has(name)) return;
    const blob = await fetchBytes(url);
    if (blob.size === 0 || blob.size > maxPhotoBytes) return;
    if (blob.type && !blob.type.startsWith("image/")) return;
    const data = await blobToBase64(blob);
    await evictFor(known, blob.size);
    await files.write(name, data);
    known.set(name, { name, size: blob.size, mtime: now() });
  }

  return {
    async lookup(url) {
      try {
        const name = photoFileName(url);
        if (!(await loadIndex()).has(name)) return null;
        return await files.uri(name);
      } catch {
        return null;
      }
    },
    save(url) {
      if (inFlight.has(url)) return queue;
      inFlight.add(url);
      queue = queue
        .then(() => saveNow(url))
        .catch(() => {})
        .finally(() => inFlight.delete(url));
      return queue;
    }
  };
}
