import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogBallImage } from "./CatalogBallImage";

const props = {
  src: "https://example.test/pitch-black.png",
  alt: "Storm Pitch Black",
  brand: "Storm" as const,
  size: "thumb" as const
};

describe("CatalogBallImage", () => {
  it("fades in on the first load, then paints opaque on remount", () => {
    // The shot panel remounts on every shot change. Before this, `loaded` reset
    // to false each time and the brand placeholder flashed for a picture the
    // browser already held.
    const first = render(<CatalogBallImage {...props} />);
    const img = screen.getByAltText(props.alt);

    expect(img.className).toContain("opacity-0");
    expect(img.className).toContain("duration-300");

    fireEvent.load(img);
    expect(img.className).toContain("opacity-100");

    first.unmount();
    render(<CatalogBallImage {...props} />);
    const remounted = screen.getByAltText(props.alt);

    expect(remounted.className).toContain("opacity-100");
    expect(remounted.className).not.toContain("opacity-0");
    // No fade to replay either, it was never transparent.
    expect(remounted.className).toContain("duration-0");
  });

  it("keeps a never-loaded source transparent", () => {
    render(<CatalogBallImage {...props} src="https://example.test/other.png" />);
    expect(screen.getByAltText(props.alt).className).toContain("opacity-0");
  });

  describe("in the store app (ADR-155)", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("loads a catalog photo from headpin.app, since the app keeps none of its own", () => {
      vi.stubGlobal("Capacitor", { isNativePlatform: () => true });
      render(<CatalogBallImage {...props} src="/catalog/img/pitch-black-thumb.webp" />);
      expect(screen.getByAltText(props.alt).getAttribute("src")).toBe(
        "https://headpin.app/catalog/img/pitch-black-thumb.webp"
      );
    });
  });

  it("loads a catalog photo from the page's own site on the web", () => {
    render(<CatalogBallImage {...props} src="/catalog/img/pitch-black-thumb.webp" />);
    expect(screen.getByAltText(props.alt).getAttribute("src")).toBe("/catalog/img/pitch-black-thumb.webp");
  });
});

describe("CatalogBallImage in the store app", () => {
  const lookup = vi.fn();
  const save = vi.fn();

  async function renderNative() {
    vi.resetModules();
    vi.doMock("../lib/nativePhotoStore", () => ({ nativePhotoStore: () => ({ lookup, save }) }));
    const { CatalogBallImage: Native } = await import("./CatalogBallImage");
    return render(<Native {...props} src="https://headpin.app/catalog/img/native.webp" />);
  }

  afterEach(() => {
    vi.doUnmock("../lib/nativePhotoStore");
    lookup.mockReset();
    save.mockReset();
  });

  it("starts from the network and keeps the photo once it has loaded", async () => {
    lookup.mockResolvedValue(null);
    await renderNative();
    const img = screen.getByAltText(props.alt);
    expect(img).toHaveAttribute("src", "https://headpin.app/catalog/img/native.webp");

    fireEvent.load(img);
    expect(save).toHaveBeenCalledWith("https://headpin.app/catalog/img/native.webp");
  });

  it("serves the kept copy when it is found before the network answers", async () => {
    lookup.mockResolvedValue("capacitor://localhost/_capacitor_file_/native.webp");
    await renderNative();
    await waitFor(() =>
      expect(screen.getByAltText(props.alt)).toHaveAttribute("src", "capacitor://localhost/_capacitor_file_/native.webp")
    );
    fireEvent.load(screen.getByAltText(props.alt));
    expect(save).not.toHaveBeenCalled();
  });

  it("falls back to the kept copy when the network fails", async () => {
    lookup.mockResolvedValueOnce(null).mockResolvedValue("capacitor://localhost/_capacitor_file_/native.webp");
    await renderNative();
    fireEvent.error(screen.getByAltText(props.alt));
    await waitFor(() =>
      expect(screen.getByAltText(props.alt)).toHaveAttribute("src", "capacitor://localhost/_capacitor_file_/native.webp")
    );
  });

  it("falls back to the network when the kept file has gone missing", async () => {
    lookup.mockResolvedValue("capacitor://localhost/_capacitor_file_/native.webp");
    await renderNative();
    await waitFor(() => expect(screen.getByAltText(props.alt).getAttribute("src")).toContain("_capacitor_file_"));
    fireEvent.error(screen.getByAltText(props.alt));
    await waitFor(() =>
      expect(screen.getByAltText(props.alt)).toHaveAttribute("src", "https://headpin.app/catalog/img/native.webp")
    );
  });

  it("shows the placeholder when neither copy exists", async () => {
    lookup.mockResolvedValue(null);
    await renderNative();
    fireEvent.error(screen.getByAltText(props.alt));
    await waitFor(() => expect(screen.queryByAltText(props.alt)).toBeNull());
  });
});
