import { act, render, waitFor } from "@testing-library/react";
import { Check, SlidersHorizontal } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IconButton } from "../components/ui/IconButton";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { LaneViewIcon, ShareIosIcon } from "../components/icons";
import {
  GlassBarContext,
  GlassLayer,
  NATIVE_GLASS_ATTR,
  SETTLE_TICKS,
  loadGlassLayer,
  rasterizeIcon,
  resetGlassLayer,
  symbolFor,
  type GlassLayerDeps,
  type GlassPlugin,
  type GlassSpec
} from "./nativeGlass";

const BUTTON: GlassSpec = { kind: "button", prominent: false, symbol: "plus", enabled: true };

function fakePlugin() {
  const listeners = new Map<string, (data: never) => void>();
  const mocks = {
    probe: vi.fn().mockResolvedValue({ supported: true }),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn(async (event: string, listener: (data: never) => void) => {
      listeners.set(event, listener);
      return { remove: vi.fn().mockResolvedValue(undefined) };
    })
  };
  return { plugin: mocks as unknown as GlassPlugin, mocks, listeners };
}

function box(el: HTMLElement, x = 10, y = 20, width = 44, height = 44) {
  el.getBoundingClientRect = () => ({ left: x, top: y, width, height }) as DOMRect;
}

function makeLayer(over: Partial<GlassLayerDeps> = {}) {
  const { plugin, mocks, listeners } = fakePlugin();
  let clock = 0;
  const frames: Array<() => void> = [];
  const laters: Array<() => void> = [];
  const deps: GlassLayerDeps = {
    plugin,
    topAt: (x, y) => document.elementFromPoint?.(x, y) ?? null,
    theme: () => ({ dark: true, accent: "#1b5148" }),
    viewport: () => ({ width: 390, height: 844 }),
    frame: vi.fn((run) => frames.push(run)),
    cancelFrame: vi.fn(),
    later: vi.fn((run) => laters.push(run)),
    cancelLater: vi.fn(),
    now: () => clock,
    hidden: () => false,
    ...over
  };
  const layer = new GlassLayer(deps);
  return {
    layer,
    deps,
    mocks,
    listeners,
    frames,
    laters,
    advance: (ms: number) => {
      clock += ms;
    }
  };
}

function control() {
  const el = document.createElement("button");
  document.body.append(el);
  box(el);
  return el;
}

/** Ticks a still, uncovered control until the phone has it. */
async function settle(layer: GlassLayer) {
  for (let i = 0; i <= SETTLE_TICKS; i++) layer.tick();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  document.body.innerHTML = "";
  resetGlassLayer();
  vi.restoreAllMocks();
});

describe("symbolFor", () => {
  it("finds the SF Symbol for a Lucide glyph and for one of the app's own", () => {
    const { container } = render(
      <>
        <span data-testid="a"><Check /></span>
        <span data-testid="b"><ShareIosIcon /></span>
        <span data-testid="c"><LaneViewIcon /></span>
        <span data-testid="d" />
      </>
    );
    const [a, b, c, d] = Array.from(container.querySelectorAll("span"));
    expect(symbolFor(a)).toBe("checkmark");
    expect(symbolFor(b)).toBe("square.and.arrow.up");
    expect(symbolFor(c)).toBeNull();
    expect(symbolFor(d)).toBeNull();
  });
});

describe("rasterizeIcon", () => {
  it("is null with no glyph, or where the page cannot draw one", async () => {
    expect(await rasterizeIcon(document.createElement("span"))).toBeNull();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const { container } = render(<span><LaneViewIcon size={21} /></span>);
    expect(await rasterizeIcon(container.firstElementChild!)).toBeNull();
  });

  it("draws the glyph to a PNG, once per glyph", async () => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,AAA");
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", FakeImage);
    const { container } = render(<span><LaneViewIcon size={23} /></span>);
    const first = await rasterizeIcon(container.firstElementChild!);
    const again = await rasterizeIcon(container.firstElementChild!);
    expect(first).toBe("data:image/png;base64,AAA");
    expect(again).toBe(first);
    expect(drawImage).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("is null when the glyph fails to load or the canvas will not export", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => {
      throw new Error("tainted");
    });
    let fail = true;
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_: string) {
        queueMicrotask(() => (fail ? this.onerror?.() : this.onload?.()));
      }
    }
    vi.stubGlobal("Image", FakeImage);
    const { container } = render(<span><LaneViewIcon size={25} /></span>);
    expect(await rasterizeIcon(container.firstElementChild!)).toBeNull();
    fail = false;
    const { container: other } = render(<span><LaneViewIcon size={26} /></span>);
    expect(await rasterizeIcon(other.firstElementChild!)).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe("GlassLayer", () => {
  it("draws a control once it has held still, then hides the page's", async () => {
    const el = control();
    const { layer, mocks } = makeLayer({ topAt: () => el });
    layer.register("a", el, BUTTON);
    for (let i = 0; i < SETTLE_TICKS; i++) layer.tick();
    expect(mocks.set).not.toHaveBeenCalled();
    await settle(layer);
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "a",
        visible: true,
        frame: { x: 10, y: 20, width: 44, height: 44 },
        dark: true,
        accent: "#1b5148",
        symbol: "plus"
      })
    );
    expect(el.getAttribute(NATIVE_GLASS_ATTR)).toBe("on");
    // Nothing new, nothing sent.
    const calls = mocks.set.mock.calls.length;
    layer.tick();
    expect(mocks.set).toHaveBeenCalledTimes(calls);
  });

  it("puts the page's own back the moment the control moves, and hides the phone's", async () => {
    const el = control();
    const { layer, mocks } = makeLayer({ topAt: () => el });
    layer.register("a", el, BUTTON);
    await settle(layer);
    box(el, 60);
    layer.tick();
    expect(el.hasAttribute(NATIVE_GLASS_ATTR)).toBe(false);
    expect(mocks.set).toHaveBeenLastCalledWith(expect.objectContaining({ id: "a", visible: false }));
    // Hidden once, not on every frame it keeps moving.
    const calls = mocks.set.mock.calls.length;
    box(el, 80);
    layer.tick();
    expect(mocks.set).toHaveBeenCalledTimes(calls);
    // Still again, it comes back where it now is.
    await settle(layer);
    expect(mocks.set).toHaveBeenLastCalledWith(
      expect.objectContaining({ visible: true, frame: { x: 80, y: 20, width: 44, height: 44 } })
    );
  });

  it("leaves a covered, off-screen, empty or backgrounded control to the page", async () => {
    const covered = control();
    const offscreen = control();
    box(offscreen, 380);
    const empty = control();
    box(empty, 0, 0, 0, 0);
    const other = document.createElement("div");
    const { layer, mocks } = makeLayer({ topAt: () => other });
    layer.register("covered", covered, BUTTON);
    layer.register("off", offscreen, BUTTON);
    layer.register("empty", empty, BUTTON);
    await settle(layer);
    expect(mocks.set).not.toHaveBeenCalled();

    const el = control();
    let background = false;
    const second = makeLayer({ topAt: () => el, hidden: () => background });
    second.layer.register("a", el, BUTTON);
    await settle(second.layer);
    background = true;
    second.layer.tick();
    expect(second.mocks.set).toHaveBeenLastCalledWith(expect.objectContaining({ visible: false }));
  });

  it("counts a tap on the control's own glyph as uncovered", async () => {
    const el = control();
    const glyph = document.createElement("span");
    el.append(glyph);
    const { layer, mocks } = makeLayer({ topAt: () => glyph });
    layer.register("a", el, BUTTON);
    await settle(layer);
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ visible: true }));
  });

  it("sends a changed control again, and drops one taken away", async () => {
    const el = control();
    const { layer, mocks } = makeLayer({ topAt: () => el });
    const done = layer.register("a", el, BUTTON);
    await settle(layer);
    layer.update("a", { ...BUTTON, badge: "2" });
    layer.update("missing", BUTTON);
    layer.tick();
    expect(mocks.set).toHaveBeenLastCalledWith(expect.objectContaining({ badge: "2" }));
    done();
    expect(mocks.remove).toHaveBeenCalledWith({ id: "a" });
    expect(el.hasAttribute(NATIVE_GLASS_ATTR)).toBe(false);
    layer.tick();
  });

  it("does not let a stale answer hide the page's control", async () => {
    const el = control();
    let answer: () => void = () => {};
    const { layer, mocks } = makeLayer({ topAt: () => el });
    mocks.set.mockImplementationOnce(() => new Promise<void>((resolve) => (answer = resolve)));
    layer.register("a", el, BUTTON);
    for (let i = 0; i <= SETTLE_TICKS; i++) layer.tick();
    box(el, 50);
    layer.tick();
    answer();
    await Promise.resolve();
    await Promise.resolve();
    expect(el.hasAttribute(NATIVE_GLASS_ATTR)).toBe(false);
  });

  it("tries again after the phone fails to draw a control", async () => {
    const el = control();
    const { layer, mocks } = makeLayer({ topAt: () => el });
    mocks.set.mockRejectedValueOnce(new Error("no screen"));
    layer.register("a", el, BUTTON);
    await settle(layer);
    expect(el.hasAttribute(NATIVE_GLASS_ATTR)).toBe(false);
    layer.tick();
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.set).toHaveBeenCalledTimes(2);
    expect(el.getAttribute(NATIVE_GLASS_ATTR)).toBe("on");
  });

  it("passes the phone's tap to the page's control, and a new segment to its handler", async () => {
    const el = control();
    const click = vi.fn();
    el.addEventListener("click", click);
    const onChange = vi.fn();
    const { layer, listeners } = makeLayer();
    await layer.listen();
    layer.register("a", el, BUTTON);
    layer.register("s", control(), { kind: "segmented", options: ["A", "B"], selected: 0, enabled: true }, onChange);
    listeners.get("tap")!({ id: "a" } as never);
    listeners.get("tap")!({ id: "nobody" } as never);
    listeners.get("change")!({ id: "s", index: 1 } as never);
    expect(click).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("checks every frame while things move, and four times a second once still", async () => {
    const el = control();
    const { layer, deps, frames, laters, advance } = makeLayer({ topAt: () => el });
    const done = layer.register("a", el, BUTTON);
    expect(deps.frame).toHaveBeenCalledTimes(1);
    for (let i = 0; i < SETTLE_TICKS + 2; i++) frames.shift()!();
    advance(1000);
    frames.shift()!();
    expect(deps.later).toHaveBeenCalledTimes(1);
    // An event cuts the quiet wait short and goes back to every frame.
    layer.wake();
    expect(deps.cancelLater).toHaveBeenCalledTimes(1);
    expect(frames.length).toBe(1);
    done();
    expect(deps.cancelFrame).toHaveBeenCalledTimes(1);
    // Stopped twice is still stopped.
    layer.stop();
    laters.length = 0;
  });

  it("stops a quiet wait when the last control goes", () => {
    const el = control();
    const { layer, deps, frames, advance } = makeLayer({ topAt: () => el });
    const done = layer.register("a", el, BUTTON);
    for (let i = 0; i < SETTLE_TICKS + 2; i++) frames.shift()!();
    advance(1000);
    frames.shift()!();
    done();
    expect(deps.cancelLater).toHaveBeenCalledTimes(1);
  });
});

describe("loadGlassLayer", () => {
  it("is nothing outside the iPhone app, before iOS 26, or without the plugin", async () => {
    const { plugin, mocks } = fakePlugin();
    expect(await loadGlassLayer(async () => plugin, false)).toBeNull();
    expect(mocks.probe).not.toHaveBeenCalled();

    mocks.probe.mockResolvedValueOnce({ supported: false });
    expect(await loadGlassLayer(async () => plugin, true)).toBeNull();
    resetGlassLayer();
    expect(await loadGlassLayer(async () => Promise.reject(new Error("missing")), true)).toBeNull();
  });

  it("makes one layer, listening to the phone and to the page's movements", async () => {
    const { plugin, mocks } = fakePlugin();
    const made = await loadGlassLayer(async () => plugin, true);
    expect(made).toBeInstanceOf(GlassLayer);
    expect(mocks.addListener).toHaveBeenCalledWith("tap", expect.any(Function));
    expect(await loadGlassLayer(async () => plugin, true)).toBe(made);
    const wake = vi.spyOn(made!, "wake");
    window.dispatchEvent(new Event("scroll"));
    expect(wake).toHaveBeenCalled();
  });

  it("reads the page itself: what is on top, the theme, the window and the clock", async () => {
    vi.useFakeTimers();
    const { plugin, mocks } = fakePlugin();
    const made = (await loadGlassLayer(async () => plugin, true))!;
    const el = control();
    document.elementFromPoint = () => el;
    document.documentElement.dataset.theme = "dark";
    const done = made.register("a", el, BUTTON);
    for (let i = 0; i <= SETTLE_TICKS + 2; i++) vi.advanceTimersByTime(17);
    vi.advanceTimersByTime(2000);
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ id: "a", visible: true, dark: true }));
    made.wake();
    done();
    vi.useRealTimers();
    delete document.documentElement.dataset.theme;
    delete (document as { elementFromPoint?: unknown }).elementFromPoint;
  });
});

describe("bar controls", () => {
  function layerSpy() {
    const { layer } = makeLayer();
    const register = vi.spyOn(layer, "register");
    const update = vi.spyOn(layer, "update");
    resetGlassLayer(layer);
    return { register, update };
  }

  it("hands a bar's round button to the phone, with its symbol and count", async () => {
    const { register, update } = layerSpy();
    const { rerender } = render(
      <GlassBarContext.Provider value={true}>
        <IconButton label="Filters" variant="round" badge={2} onClick={() => {}}>
          <SlidersHorizontal />
        </IconButton>
      </GlassBarContext.Provider>
    );
    await waitFor(() =>
      expect(register).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(HTMLButtonElement),
        expect.objectContaining({ kind: "button", symbol: "slider.horizontal.3", badge: "2", prominent: false })
      )
    );
    rerender(
      <GlassBarContext.Provider value={true}>
        <IconButton label="Filters" variant="round" badge={0} onClick={() => {}}>
          <SlidersHorizontal />
        </IconButton>
      </GlassBarContext.Provider>
    );
    await waitFor(() =>
      expect(update).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ badge: undefined }))
    );
  });

  it("sends a glyph with no symbol as a picture", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,BBB");
    class FakeImage {
      onload: (() => void) | null = null;
      set src(_: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", FakeImage);
    const { register } = layerSpy();
    render(
      <GlassBarContext.Provider value={true}>
        <IconButton label="Lane" variant="confirm">
          <LaneViewIcon size={27} />
        </IconButton>
      </GlassBarContext.Provider>
    );
    await waitFor(() =>
      expect(register).toHaveBeenCalledWith(
        expect.any(String),
        expect.anything(),
        expect.objectContaining({ image: "data:image/png;base64,BBB", prominent: true })
      )
    );
    vi.unstubAllGlobals();
  });

  it("leaves controls outside a bar, and the plain variants, to the page", async () => {
    const { register } = layerSpy();
    render(
      <>
        <IconButton label="Add" variant="round">
          <Check />
        </IconButton>
        <GlassBarContext.Provider value={true}>
          <IconButton label="Delete">
            <Check />
          </IconButton>
        </GlassBarContext.Provider>
      </>
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(register).not.toHaveBeenCalled();
  });

  it("hands a bar's segmented control to the phone, and takes its answer", async () => {
    const { register, update } = layerSpy();
    const onChange = vi.fn();
    const options = [
      { value: "10", label: "Last 10" },
      { value: "all", label: "All" }
    ] as const;
    const { rerender } = render(
      <GlassBarContext.Provider value={true}>
        <SegmentedControl label="Range" options={options} value="10" onChange={onChange} />
      </GlassBarContext.Provider>
    );
    await waitFor(() => expect(register).toHaveBeenCalled());
    const [, , spec, relay] = register.mock.calls[0];
    expect(spec).toEqual({ kind: "segmented", options: ["Last 10", "All"], selected: 0, enabled: true });
    relay!(1);
    relay!(0);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("all");
    rerender(
      <GlassBarContext.Provider value={true}>
        <SegmentedControl label="Range" options={options} value="all" onChange={onChange} />
      </GlassBarContext.Provider>
    );
    await waitFor(() =>
      expect(update).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({ selected: 1 }),
        expect.any(Function)
      )
    );
  });
});
