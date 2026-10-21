import { isNativeApp } from "./platform";
import { createPhotoStore, type PhotoFiles, type PhotoStore } from "./photoStore";

/**
 * The photo store on the phone's disk (ADR-162). Capacitor's plugins are
 * imported on first use, as in `nativeShare.ts`, so the web app's bundle never
 * loads them, and `nativePhotoStore()` answers null there.
 */

const DIRECTORY = "photos";

let filesPromise: Promise<PhotoFiles> | null = null;
const capacitorFiles = () => (filesPromise ??= openCapacitorFiles());

async function openCapacitorFiles(): Promise<PhotoFiles> {
  const [{ Filesystem, Directory }, { Capacitor }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/core")
  ]);
  const directory = Directory.Data;
  let ready: Promise<unknown> | null = null;
  const ensureDir = () =>
    (ready ??= Filesystem.mkdir({ path: DIRECTORY, directory, recursive: true }).catch(() => {}));

  return {
    async list() {
      await ensureDir();
      const { files } = await Filesystem.readdir({ path: DIRECTORY, directory });
      return files.map((f) => ({ name: f.name, size: f.size, mtime: f.mtime ?? 0 }));
    },
    async uri(name) {
      const { uri } = await Filesystem.getUri({ path: `${DIRECTORY}/${name}`, directory });
      return Capacitor.convertFileSrc(uri);
    },
    async write(name, base64) {
      await ensureDir();
      await Filesystem.writeFile({ path: `${DIRECTORY}/${name}`, data: base64, directory });
    },
    async remove(name) {
      await Filesystem.deleteFile({ path: `${DIRECTORY}/${name}`, directory });
    }
  };
}

let store: PhotoStore | null = null;

/** The device's photo store, or null on the web (and so never created there). */
export function nativePhotoStore(native = isNativeApp()): PhotoStore | null {
  if (!native) return null;
  store ??= createPhotoStore({
    list: async () => (await capacitorFiles()).list(),
    uri: async (name) => (await capacitorFiles()).uri(name),
    write: async (name, data) => (await capacitorFiles()).write(name, data),
    remove: async (name) => (await capacitorFiles()).remove(name)
  });
  return store;
}
