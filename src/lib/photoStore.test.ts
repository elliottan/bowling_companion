import { describe, expect, it } from "vitest";
import { createPhotoStore, photoFileName, type PhotoFile, type PhotoFiles } from "./photoStore";
import { nativePhotoStore } from "./nativePhotoStore";

const A = "https://headpin.app/catalog/img/storm-a-full.webp";
const B = "https://headpin.app/catalog/img/storm-b-full.webp";
const C = "https://headpin.app/catalog/img/storm-c-full.webp";

/** A disk in memory. `clock` is what the fake stamps writes with. */
function fakeDisk(initial: PhotoFile[] = []) {
  const files = new Map(initial.map((f) => [f.name, f]));
  const calls = { list: 0, write: [] as string[], remove: [] as string[] };
  const disk: PhotoFiles = {
    async list() {
      calls.list++;
      return [...files.values()];
    },
    async uri(name) {
      return `capacitor://localhost/_capacitor_file_/photos/${name}`;
    },
    async write(name, base64) {
      calls.write.push(name);
      files.set(name, { name, size: atob(base64).length, mtime: 0 });
    },
    async remove(name) {
      calls.remove.push(name);
      files.delete(name);
    }
  };
  return { disk, files, calls };
}

const bytes = (n: number) => new Blob([new Uint8Array(n)], { type: "image/webp" });

describe("photoFileName", () => {
  it("is stable, readable and keeps the extension", () => {
    expect(photoFileName(A)).toBe(photoFileName(A));
    expect(photoFileName(A)).toMatch(/^catalog-img-storm-a-full-[a-z0-9]+\.webp$/);
  });

  it("tells apart addresses that sanitize alike", () => {
    expect(photoFileName("https://x.test/a_b.webp")).not.toBe(photoFileName("https://x.test/a/b.webp"));
  });
});

describe("createPhotoStore", () => {
  it("has nothing for a photo it has not saved", async () => {
    const { disk } = fakeDisk();
    expect(await createPhotoStore(disk).lookup(A)).toBeNull();
  });

  it("saves a photo once and serves it from disk afterwards", async () => {
    const { disk, calls } = fakeDisk();
    let fetched = 0;
    const store = createPhotoStore(disk, {
      fetchBytes: async () => {
        fetched++;
        return bytes(100);
      }
    });
    await store.save(A);
    await store.save(A);

    expect(fetched).toBe(1);
    expect(calls.write).toEqual([photoFileName(A)]);
    expect(await store.lookup(A)).toBe(`capacitor://localhost/_capacitor_file_/photos/${photoFileName(A)}`);
  });

  it("finds what an earlier launch saved, reading the directory once", async () => {
    const { disk, calls } = fakeDisk([{ name: photoFileName(A), size: 10, mtime: 1 }]);
    const store = createPhotoStore(disk);
    expect(await store.lookup(A)).not.toBeNull();
    expect(await store.lookup(B)).toBeNull();
    expect(calls.list).toBe(1);
  });

  it("evicts the oldest photos to stay under the cap", async () => {
    const { disk, files } = fakeDisk([
      { name: photoFileName(A), size: 60, mtime: 1 },
      { name: photoFileName(B), size: 30, mtime: 2 }
    ]);
    const store = createPhotoStore(disk, { maxBytes: 100, fetchBytes: async () => bytes(50) });
    await store.save(C);

    expect([...files.keys()].sort()).toEqual([photoFileName(B), photoFileName(C)].sort());
    expect(await store.lookup(A)).toBeNull();
  });

  it("does not keep a photo that is too large, empty, or not an image", async () => {
    const { disk, calls } = fakeDisk();
    const sizes = new Map<string, Blob>([
      [A, bytes(5000)],
      [B, bytes(0)],
      [C, new Blob(["<html>"], { type: "text/html" })]
    ]);
    const store = createPhotoStore(disk, { maxPhotoBytes: 1000, fetchBytes: async (u) => sizes.get(u)! });
    await Promise.all([store.save(A), store.save(B), store.save(C)]);
    expect(calls.write).toEqual([]);
  });

  it("reads a failed fetch (offline) as nothing to keep, and tries again later", async () => {
    const { disk, calls } = fakeDisk();
    let offline = true;
    const store = createPhotoStore(disk, {
      fetchBytes: async () => {
        if (offline) throw new Error("offline");
        return bytes(10);
      }
    });
    await expect(store.save(A)).resolves.toBeUndefined();
    expect(calls.write).toEqual([]);
    offline = false;
    await store.save(A);
    expect(calls.write).toEqual([photoFileName(A)]);
  });

  it("reads a disk that cannot be listed or written as not stored", async () => {
    const broken: PhotoFiles = {
      list: async () => {
        throw new Error("no disk");
      },
      uri: async () => {
        throw new Error("no disk");
      },
      write: async () => {
        throw new Error("no disk");
      },
      remove: async () => {}
    };
    const store = createPhotoStore(broken, { fetchBytes: async () => bytes(10) });
    await expect(store.save(A)).resolves.toBeUndefined();
    expect(await store.lookup(A)).toBeNull();
  });
});

describe("nativePhotoStore", () => {
  it("is absent on the web, so none of it runs there", () => {
    expect(nativePhotoStore(false)).toBeNull();
  });
});
