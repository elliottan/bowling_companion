import { beforeEach, describe, expect, it, vi } from "vitest";

const writeFile = vi.fn(async ({ path }: { path: string }) => ({ uri: `file:///cache/${path}` }));
const share = vi.fn(async (_options: unknown) => ({}));

vi.mock("@capacitor/filesystem", () => ({
  Filesystem: { writeFile: (o: { path: string }) => writeFile(o) },
  Directory: { Cache: "CACHE" },
  Encoding: { UTF8: "utf8" }
}));
vi.mock("@capacitor/share", () => ({ Share: { share: (o: unknown) => share(o) } }));

const { shareFileFromApp, shareLinkFromApp } = await import("./nativeShare");

beforeEach(() => {
  writeFile.mockClear();
  share.mockReset();
  share.mockResolvedValue({});
});

describe("shareFileFromApp", () => {
  it("writes text to the cache as UTF-8 and opens the sheet on it", async () => {
    expect(await shareFileFromApp("headpin.json", '{"a":1}')).toBe("shared");
    expect(writeFile).toHaveBeenCalledWith({
      path: "headpin.json",
      data: '{"a":1}',
      directory: "CACHE",
      encoding: "utf8"
    });
    expect(share).toHaveBeenCalledWith({ files: ["file:///cache/headpin.json"] });
  });

  it("writes a picture as bytes, base64 with no data URL prefix", async () => {
    await shareFileFromApp("card.png", new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));
    expect(writeFile).toHaveBeenCalledWith({ path: "card.png", data: "AQID", directory: "CACHE" });
  });

  it("reads a closed sheet as cancelled, not as a failure", async () => {
    share.mockRejectedValue(new Error("Share canceled"));
    expect(await shareFileFromApp("headpin.json", "{}")).toBe("cancelled");
  });

  it("passes any other failure on", async () => {
    share.mockRejectedValue(new Error("No app can handle this"));
    await expect(shareFileFromApp("headpin.json", "{}")).rejects.toThrow("No app can handle this");
  });
});

describe("shareLinkFromApp", () => {
  it("shares the title and the link", async () => {
    expect(await shareLinkFromApp("A line", "https://headpin.app/app?ld=20")).toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: "A line", url: "https://headpin.app/app?ld=20" });
  });

  it("reads a closed sheet as cancelled, and passes anything else on", async () => {
    share.mockRejectedValueOnce("Share canceled");
    expect(await shareLinkFromApp("A line", "https://headpin.app")).toBe("cancelled");
    share.mockRejectedValueOnce(new Error("boom"));
    await expect(shareLinkFromApp("A line", "https://headpin.app")).rejects.toThrow("boom");
  });
});
